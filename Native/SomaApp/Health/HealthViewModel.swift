#if os(iOS)
import Foundation
import Observation
import SomaCore

@MainActor
@Observable
final class HealthViewModel {
    enum State: Equatable {
        case checking
        case unavailable
        case authorizationNeeded
        case authorizationIndeterminate
        case ready
        case loading
        case noAccessibleData
        case loaded
        case interrupted
        case failed
    }

    var state: State = .checking
    var snapshot: HealthSnapshot?

    private let reader: any HealthSnapshotReading

    init(reader: any HealthSnapshotReading = HealthKitReader()) {
        self.reader = reader
    }

    func loadAuthorizationState() async {
        guard state == .checking else { return }
        do {
            switch try await reader.authorizationRequestState() {
            case .unavailable: state = .unavailable
            case .shouldRequest: state = .authorizationNeeded
            case .responseAlreadyRecorded: state = .ready
            case .unknown: state = .authorizationIndeterminate
            }
        } catch is CancellationError {
            state = .interrupted
        } catch {
            state = .failed
        }
    }

    func authorizeAndRead() async {
        state = .loading
        do {
            try await reader.requestAuthorization()
            try await readRecentData()
        } catch is CancellationError {
            state = .interrupted
        } catch HealthKitReaderError.unavailable {
            state = .unavailable
        } catch {
            state = .failed
        }
    }

    func readRecentData() async throws {
        state = .loading
        let snapshot = try await reader.recentSnapshot(days: 7)
        self.snapshot = snapshot
        state = snapshot.records.isEmpty ? .noAccessibleData : .loaded
    }

    func retry() async {
        do {
            try await readRecentData()
        } catch is CancellationError {
            state = .interrupted
        } catch HealthKitReaderError.unavailable {
            state = .unavailable
        } catch {
            state = .failed
        }
    }
}
#endif
