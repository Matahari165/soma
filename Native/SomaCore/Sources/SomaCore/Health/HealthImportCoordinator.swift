import Foundation

public actor HealthImportCoordinator {
    private let source: any HealthDataSource
    private let destination: any HealthImportDestination
    private let checkpointStore: any HealthImportCheckpointStore

    public init(
        source: any HealthDataSource,
        destination: any HealthImportDestination,
        checkpointStore: any HealthImportCheckpointStore
    ) {
        self.source = source
        self.destination = destination
        self.checkpointStore = checkpointStore
    }

    public func synchronize() async throws -> HealthImportOutcome {
        let pending: PendingHealthImport
        let resumed: Bool

        if let staged = try await checkpointStore.pendingImport() {
            pending = staged
            resumed = true
        } else {
            let cursor = try await checkpointStore.committedCursor()
            let result = try await source.readChanges(after: cursor)
            pending = PendingHealthImport(batch: result.batch, nextCursor: result.nextCursor)
            try await checkpointStore.stage(pending)
            resumed = false
        }

        if !pending.batch.isEmpty {
            try await destination.importHealth(pending.batch)
        }

        try await checkpointStore.commit(pending.nextCursor)
        try await checkpointStore.clearPending()

        if pending.batch.isEmpty {
            return .noChanges
        }

        return .imported(
            recordCount: pending.batch.records.count,
            deletionCount: pending.batch.deletions.count,
            resumed: resumed
        )
    }
}
