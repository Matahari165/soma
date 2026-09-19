import Foundation

public enum EffortProvenance: String, Codable, Equatable, Sendable {
    case googleHealth = "google_health"
    case somaCalculation = "soma_calculation"
}

public struct EffortSnapshot: Codable, Equatable, Sendable {
    public let timezone: String
    public let period: EffortPeriod?
    public let latestObservedDate: String?
    public let importedAt: String?
    public let measuredAt: String?
    public let latest: EffortDay?
    public let score: EffortScore?
    public let coverage: EffortCoverage
    public let trends: [EffortTrendDay]
    public let exercises: [EffortExercise]
}

public struct EffortPeriod: Codable, Equatable, Sendable {
    public let days: Int
    public let startDate: String
    public let endDate: String
}

public struct EffortDay: Codable, Equatable, Sendable {
    public let date: String
    public let steps: Double?
    public let exerciseMinutes: Double?
    public let activeEnergyKcal: Double?
    public let zoneMinutes: Double?
    public let weeklyLoad: Double?
    public let acuteChronicLoadRatio: Double?
    public let zones: EffortZones
    public let provenance: EffortProvenance
}

public struct EffortZones: Codable, Equatable, Sendable {
    public let light: Double?
    public let moderate: Double?
    public let vigorous: Double?
    public let peak: Double?

    public var hasMeasurements: Bool { [light, moderate, vigorous, peak].contains { $0 != nil } }
}

public struct EffortScore: Codable, Equatable, Sendable {
    public let value: Double
    public let date: String
    public let coverage: Double?
    public let algorithmVersion: String?
    public let provenance: EffortProvenance
}

public struct EffortCoverage: Codable, Equatable, Sendable {
    public let expectedDays: Int
    public let observedActivityDays: Int
    public let byMetric: [String: Double]
}

public struct EffortTrendDay: Codable, Equatable, Sendable {
    public let date: String
    public let steps: Double?
    public let exerciseMinutes: Double?
    public let activeEnergyKcal: Double?
    public let zoneMinutes: Double?
}

public struct EffortExercise: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let date: String
    public let name: String
    public let type: String
    public let durationMinutes: Double?
    public let activeMinutes: Double?
    public let calories: Double?
    public let distanceKm: Double?
    public let averageHeartRate: Double?
    public let zoneMinutes: Double?
    public let averageSpeedKph: Double?
    public let averagePaceSecondsPerKm: Double?
    public let elevationGainMeters: Double?
    public let steps: Double?
    public let runVo2Max: Double?
    public let swimLengths: Double?
    public let cadence: Double?
    public let strideLengthMeters: Double?
    public let groundContactMilliseconds: Double?
    public let verticalOscillationMillimeters: Double?
    public let verticalRatio: Double?
    public let provenance: EffortProvenance
}
