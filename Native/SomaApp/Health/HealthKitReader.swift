#if os(iOS)
import Foundation
import HealthKit
import SomaCore

enum HealthAuthorizationRequestState: Sendable {
    case unavailable
    case shouldRequest
    case responseAlreadyRecorded
    case unknown
}

struct HealthSnapshot: Sendable {
    let records: [HealthSampleRecord]
    let requestedMetrics: [HealthMetricIdentifier]
    let failedMetrics: Set<HealthMetricIdentifier>
    let startDate: Date
    let endDate: Date

    var recordCountByMetric: [HealthMetricIdentifier: Int] {
        Dictionary(grouping: records, by: \.metric).mapValues(\.count)
    }

    var sourceNames: [String] {
        Array(Set(records.map(\.provenance.sourceName))).sorted()
    }

    var isPartial: Bool { !failedMetrics.isEmpty }
    var latestMeasurementDate: Date? { records.map(\.endDate).max() }
}

protocol HealthSnapshotReading: Sendable {
    func authorizationRequestState() async throws -> HealthAuthorizationRequestState
    func requestAuthorization() async throws
    func recentSnapshot(days: Int) async throws -> HealthSnapshot
}

actor HealthKitReader: HealthSnapshotReading {
    private struct QuantitySpecification {
        let metric: HealthMetricIdentifier
        let type: HKQuantityType
        let unit: HKUnit
        let unitLabel: String
        let transform: @Sendable (Double) -> Double
    }

    private let store: HKHealthStore
    private let calendar: Calendar

    init(store: HKHealthStore = HKHealthStore(), calendar: Calendar = .current) {
        self.store = store
        self.calendar = calendar
    }

    func authorizationRequestState() async throws -> HealthAuthorizationRequestState {
        guard HKHealthStore.isHealthDataAvailable() else { return .unavailable }
        let status = try await store.statusForAuthorizationRequest(toShare: [], read: readTypes)
        switch status {
        case .shouldRequest: return .shouldRequest
        case .unnecessary: return .responseAlreadyRecorded
        case .unknown: return .unknown
        @unknown default: return .unknown
        }
    }

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw HealthKitReaderError.unavailable }
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    func recentSnapshot(days: Int = 7) async throws -> HealthSnapshot {
        guard HKHealthStore.isHealthDataAvailable() else { throw HealthKitReaderError.unavailable }
        try Task.checkCancellation()

        let endDate = Date.now
        guard let startDate = calendar.date(byAdding: .day, value: -max(days, 1), to: endDate) else {
            throw HealthKitReaderError.invalidDateRange
        }
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate)
        var records: [HealthSampleRecord] = []
        var failedMetrics: Set<HealthMetricIdentifier> = []

        for specification in quantitySpecifications {
            try Task.checkCancellation()
            do {
                let samplePredicate = HKSamplePredicate.quantitySample(type: specification.type, predicate: predicate)
                let query = HKSampleQueryDescriptor(
                    predicates: [samplePredicate],
                    sortDescriptors: [SortDescriptor(\.startDate)]
                )
                let samples = try await query.result(for: store)
                records.append(contentsOf: samples.map { sample in
                    let rawValue = sample.quantity.doubleValue(for: specification.unit)
                    return HealthSampleRecord(
                        id: sample.uuid.uuidString.lowercased(),
                        metric: specification.metric,
                        startDate: sample.startDate,
                        endDate: sample.endDate,
                        value: .quantity(specification.transform(rawValue)),
                        unit: specification.unitLabel,
                        provenance: provenance(for: sample)
                    )
                })
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                failedMetrics.insert(specification.metric)
            }
        }

        try Task.checkCancellation()
        do {
            let sleepType = HKCategoryType(.sleepAnalysis)
            let sleepPredicate = HKSamplePredicate.categorySample(type: sleepType, predicate: predicate)
            let sleepQuery = HKSampleQueryDescriptor(
                predicates: [sleepPredicate],
                sortDescriptors: [SortDescriptor(\.startDate)]
            )
            let sleepSamples = try await sleepQuery.result(for: store)
            records.append(contentsOf: sleepSamples.compactMap { sample in
                guard let category = sleepCategory(sample.value) else { return nil }
                return HealthSampleRecord(
                    id: sample.uuid.uuidString.lowercased(),
                    metric: .sleepAnalysis,
                    startDate: sample.startDate,
                    endDate: sample.endDate,
                    value: .category(category),
                    unit: nil,
                    provenance: provenance(for: sample)
                )
            })
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            failedMetrics.insert(.sleepAnalysis)
        }

        return HealthSnapshot(
            records: records.sorted { $0.startDate < $1.startDate },
            requestedMetrics: HealthMetricIdentifier.allCases,
            failedMetrics: failedMetrics,
            startDate: startDate,
            endDate: endDate
        )
    }

    private var readTypes: Set<HKObjectType> {
        Set(quantitySpecifications.map(\.type) + [HKCategoryType(.sleepAnalysis)])
    }

    private var quantitySpecifications: [QuantitySpecification] {
        [
            QuantitySpecification(
                metric: .stepCount,
                type: HKQuantityType(.stepCount),
                unit: .count(),
                unitLabel: "count",
                transform: { $0 }
            ),
            QuantitySpecification(
                metric: .activeEnergyBurned,
                type: HKQuantityType(.activeEnergyBurned),
                unit: .kilocalorie(),
                unitLabel: "kcal",
                transform: { $0 }
            ),
            QuantitySpecification(
                metric: .heartRateVariabilitySDNN,
                type: HKQuantityType(.heartRateVariabilitySDNN),
                unit: .secondUnit(with: .milli),
                unitLabel: "ms",
                transform: { $0 }
            ),
            QuantitySpecification(
                metric: .restingHeartRate,
                type: HKQuantityType(.restingHeartRate),
                unit: .count().unitDivided(by: .minute()),
                unitLabel: "count/min",
                transform: { $0 }
            ),
            QuantitySpecification(
                metric: .respiratoryRate,
                type: HKQuantityType(.respiratoryRate),
                unit: .count().unitDivided(by: .minute()),
                unitLabel: "count/min",
                transform: { $0 }
            ),
            QuantitySpecification(
                metric: .oxygenSaturation,
                type: HKQuantityType(.oxygenSaturation),
                unit: .percent(),
                unitLabel: "%",
                transform: { $0 * 100 }
            ),
        ]
    }

    private func provenance(for sample: HKSample) -> HealthSampleProvenance {
        HealthSampleProvenance(
            sourceName: sample.sourceRevision.source.name,
            sourceBundleIdentifier: sample.sourceRevision.source.bundleIdentifier,
            sourceVersion: sample.sourceRevision.version,
            deviceModel: sample.device?.model
        )
    }

    private func sleepCategory(_ rawValue: Int) -> String? {
        guard let value = HKCategoryValueSleepAnalysis(rawValue: rawValue) else { return nil }
        switch value {
        case .inBed: return "in_bed"
        case .asleepUnspecified: return "asleep_unspecified"
        case .awake: return "awake"
        case .asleepCore: return "asleep_core"
        case .asleepDeep: return "asleep_deep"
        case .asleepREM: return "asleep_rem"
        @unknown default: return nil
        }
    }
}

enum HealthKitReaderError: Error {
    case unavailable
    case invalidDateRange
}
#endif
