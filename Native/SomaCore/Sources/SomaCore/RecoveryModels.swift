import Foundation

public struct NativeRecoveryResponse: Codable, Equatable, Sendable {
    public let timezone: String
    public let periodDays: Int
    public let latestDate: String?
    public let freshness: RecoveryFreshness
    public let score: RecoveryScore
    public let signals: RecoverySignals
    public let trends: RecoveryTrends
    public let provenance: RecoveryProvenance
}

public struct RecoveryFreshness: Codable, Equatable, Sendable {
    public enum State: String, Codable, Sendable { case current, partial, stale, missing }

    public let measuredAt: String?
    public let importedAt: String?
    public let state: State
    public let coverage: Double
}

public struct RecoveryScore: Codable, Equatable, Sendable {
    public let value: Double?
    public let reason: String?
    public let average: Double?
    public let measuredDays: Int
    public let coverage: Double
    public let algorithmVersion: String?
    public let components: RecoveryScoreComponents
}

public struct RecoveryScoreComponents: Codable, Equatable, Sendable {
    public let hrv: RecoveryScoreComponent
    public let restingHeartRate: RecoveryScoreComponent
    public let sleep: RecoveryScoreComponent
}

public struct RecoveryScoreComponent: Codable, Equatable, Sendable {
    public let value: Double?
    public let weight: Double
}

public struct RecoverySignals: Codable, Equatable, Sendable {
    public let hrv: RecoverySignal
    public let restingHeartRate: RecoverySignal
}

public struct RecoverySignal: Codable, Equatable, Sendable {
    public let current: Double?
    public let reference: Double?
    public let measuredDays: Int
    public let unit: String
}

public struct RecoveryTrends: Codable, Equatable, Sendable {
    public let hrv: [RecoveryTrendPoint]
    public let restingHeartRate: [RecoveryTrendPoint]
}

public struct RecoveryTrendPoint: Codable, Equatable, Sendable {
    public let date: String
    public let value: Double?
}

public struct RecoveryProvenance: Codable, Equatable, Sendable {
    public let measurements: RecoveryProvenanceItem
    public let score: RecoveryProvenanceItem
}

public struct RecoveryProvenanceItem: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case healthSource = "health_source", somaCalculation = "soma_calculation" }

    public let kind: Kind
    public let label: String
}
