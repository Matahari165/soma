import Foundation

public enum HealthMetricIdentifier: String, Codable, CaseIterable, Hashable, Sendable {
    case stepCount
    case activeEnergyBurned
    case heartRateVariabilitySDNN
    case restingHeartRate
    case respiratoryRate
    case oxygenSaturation
    case sleepAnalysis
}

public enum HealthMeasurementValue: Codable, Equatable, Sendable {
    case quantity(Double)
    case category(String)
}

public struct HealthSampleProvenance: Codable, Equatable, Sendable {
    public let provider: String
    public let sourceName: String
    public let sourceBundleIdentifier: String
    public let sourceVersion: String?
    public let deviceModel: String?

    public init(
        provider: String = "apple_health",
        sourceName: String,
        sourceBundleIdentifier: String,
        sourceVersion: String? = nil,
        deviceModel: String? = nil
    ) {
        self.provider = provider
        self.sourceName = sourceName
        self.sourceBundleIdentifier = sourceBundleIdentifier
        self.sourceVersion = sourceVersion
        self.deviceModel = deviceModel
    }
}

public struct HealthSampleRecord: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let metric: HealthMetricIdentifier
    public let startDate: Date
    public let endDate: Date
    public let value: HealthMeasurementValue
    public let unit: String?
    public let provenance: HealthSampleProvenance

    public init(
        id: String,
        metric: HealthMetricIdentifier,
        startDate: Date,
        endDate: Date,
        value: HealthMeasurementValue,
        unit: String?,
        provenance: HealthSampleProvenance
    ) {
        self.id = id
        self.metric = metric
        self.startDate = startDate
        self.endDate = endDate
        self.value = value
        self.unit = unit
        self.provenance = provenance
    }
}

public struct HealthDeletedRecord: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let metric: HealthMetricIdentifier

    public init(id: String, metric: HealthMetricIdentifier) {
        self.id = id
        self.metric = metric
    }
}

public struct HealthImportBatch: Codable, Equatable, Sendable {
    public let id: UUID
    public let records: [HealthSampleRecord]
    public let deletions: [HealthDeletedRecord]
    public let createdAt: Date

    public init(id: UUID = UUID(), records: [HealthSampleRecord], deletions: [HealthDeletedRecord], createdAt: Date = .now) {
        self.id = id
        self.records = records
        self.deletions = deletions
        self.createdAt = createdAt
    }

    public var isEmpty: Bool { records.isEmpty && deletions.isEmpty }
}

public struct HealthImportCursor: Codable, Equatable, Sendable {
    public let anchors: [HealthMetricIdentifier: Data]

    public init(anchors: [HealthMetricIdentifier: Data] = [:]) {
        self.anchors = anchors
    }
}

public struct HealthReadResult: Equatable, Sendable {
    public let batch: HealthImportBatch
    public let nextCursor: HealthImportCursor

    public init(batch: HealthImportBatch, nextCursor: HealthImportCursor) {
        self.batch = batch
        self.nextCursor = nextCursor
    }
}

public struct PendingHealthImport: Codable, Equatable, Sendable {
    public let batch: HealthImportBatch
    public let nextCursor: HealthImportCursor

    public init(batch: HealthImportBatch, nextCursor: HealthImportCursor) {
        self.batch = batch
        self.nextCursor = nextCursor
    }
}

public enum HealthImportOutcome: Equatable, Sendable {
    case noChanges
    case imported(recordCount: Int, deletionCount: Int, resumed: Bool)
}

public protocol HealthDataSource: Sendable {
    func readChanges(after cursor: HealthImportCursor?) async throws -> HealthReadResult
}

public protocol HealthImportDestination: Sendable {
    /// Implementations must treat `batch.id` as an idempotency key.
    func importHealth(_ batch: HealthImportBatch) async throws
}

public protocol HealthImportCheckpointStore: Sendable {
    func committedCursor() async throws -> HealthImportCursor?
    func pendingImport() async throws -> PendingHealthImport?
    func stage(_ pending: PendingHealthImport) async throws
    func commit(_ cursor: HealthImportCursor) async throws
    func clearPending() async throws
}
