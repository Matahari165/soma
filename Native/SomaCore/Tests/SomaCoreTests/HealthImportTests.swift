import Foundation
import Testing
@testable import SomaCore

@Test func healthSampleKeepsZeroAndProvenance() throws {
    let sample = HealthSampleRecord(
        id: "sample-zero",
        metric: .stepCount,
        startDate: Date(timeIntervalSince1970: 10),
        endDate: Date(timeIntervalSince1970: 20),
        value: .quantity(0),
        unit: "count",
        provenance: HealthSampleProvenance(
            sourceName: "Synthetic Health Source",
            sourceBundleIdentifier: "com.example.synthetic"
        )
    )

    let decoded = try JSONDecoder().decode(HealthSampleRecord.self, from: JSONEncoder().encode(sample))
    #expect(decoded.value == .quantity(0))
    #expect(decoded.provenance.provider == "apple_health")
    #expect(decoded.provenance.sourceBundleIdentifier == "com.example.synthetic")
}

@Test func missingHealthMetricIsNotEncodedAsZero() {
    let batch = HealthImportBatch(records: [], deletions: [])
    #expect(batch.records.isEmpty)
    #expect(batch.isEmpty)
}

@Test func interruptedImportResumesTheStagedBatchWithoutReadingAgain() async throws {
    let record = HealthSampleRecord(
        id: "sample-1",
        metric: .restingHeartRate,
        startDate: Date(timeIntervalSince1970: 10),
        endDate: Date(timeIntervalSince1970: 20),
        value: .quantity(51),
        unit: "count/min",
        provenance: HealthSampleProvenance(
            sourceName: "Synthetic Health Source",
            sourceBundleIdentifier: "com.example.synthetic"
        )
    )
    let batch = HealthImportBatch(records: [record], deletions: [])
    let cursor = HealthImportCursor(anchors: [.restingHeartRate: Data([1, 2, 3])])
    let source = HealthSourceStub(result: HealthReadResult(batch: batch, nextCursor: cursor))
    let destination = HealthDestinationStub(failuresRemaining: 1)
    let store = HealthCheckpointStoreStub()
    let coordinator = HealthImportCoordinator(source: source, destination: destination, checkpointStore: store)

    await #expect(throws: HealthImportTestError.interrupted) {
        try await coordinator.synchronize()
    }
    #expect(await source.readCount == 1)
    #expect(try await store.pendingImport() != nil)
    #expect(try await store.committedCursor() == nil)

    let outcome = try await coordinator.synchronize()
    #expect(outcome == .imported(recordCount: 1, deletionCount: 0, resumed: true))
    #expect(await source.readCount == 1)
    #expect(await destination.receivedBatches == [batch, batch])
    #expect(await destination.receivedBatches.map(\.id) == [batch.id, batch.id])
    #expect(try await store.pendingImport() == nil)
    #expect(try await store.committedCursor() == cursor)
}

@Test func emptyImportCommitsCursorWithoutCallingDestination() async throws {
    let cursor = HealthImportCursor(anchors: [.stepCount: Data([9])])
    let source = HealthSourceStub(
        result: HealthReadResult(
            batch: HealthImportBatch(records: [], deletions: []),
            nextCursor: cursor
        )
    )
    let destination = HealthDestinationStub()
    let store = HealthCheckpointStoreStub()
    let coordinator = HealthImportCoordinator(source: source, destination: destination, checkpointStore: store)

    #expect(try await coordinator.synchronize() == .noChanges)
    #expect(await destination.receivedBatches.isEmpty)
    #expect(try await store.committedCursor() == cursor)
}

private enum HealthImportTestError: Error {
    case interrupted
}

private actor HealthSourceStub: HealthDataSource {
    private let result: HealthReadResult
    private(set) var readCount = 0

    init(result: HealthReadResult) {
        self.result = result
    }

    func readChanges(after cursor: HealthImportCursor?) async throws -> HealthReadResult {
        readCount += 1
        return result
    }
}

private actor HealthDestinationStub: HealthImportDestination {
    private var failuresRemaining: Int
    private(set) var receivedBatches: [HealthImportBatch] = []

    init(failuresRemaining: Int = 0) {
        self.failuresRemaining = failuresRemaining
    }

    func importHealth(_ batch: HealthImportBatch) async throws {
        receivedBatches.append(batch)
        if failuresRemaining > 0 {
            failuresRemaining -= 1
            throw HealthImportTestError.interrupted
        }
    }
}

private actor HealthCheckpointStoreStub: HealthImportCheckpointStore {
    private var cursor: HealthImportCursor?
    private var pending: PendingHealthImport?

    func committedCursor() async throws -> HealthImportCursor? { cursor }
    func pendingImport() async throws -> PendingHealthImport? { pending }
    func stage(_ pending: PendingHealthImport) async throws { self.pending = pending }
    func commit(_ cursor: HealthImportCursor) async throws { self.cursor = cursor }
    func clearPending() async throws { pending = nil }
}
