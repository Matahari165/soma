import Foundation

/// The server-canonical snapshot used by the native Jour surface.
///
/// Numeric values stay optional all the way to the view: `nil` means that the
/// source did not provide a measure, while `0` remains an explicit measure.
public struct NativeOverviewResponse: Codable, Equatable, Sendable {
    public let todayDate: String
    public let overnightFingerprint: String?
    public let greetingName: String
    public let timeZone: String
    public let today: NativeOverviewToday
}

public struct NativeOverviewToday: Codable, Equatable, Sendable {
    public let sleepMinutes: Double?
    public let sleepRegularity: Double?
    public let recoveryScore: Double?
    public let effortScore: Double?
    public let effortCoverage: Double?
    public let caloriesKcal: Double?
    public let calorieTarget: Double?
    public let averageSleepMinutes: Double?
    public let averageSleepRegularity: Double?
    public let averageRecoveryScore: Double?
    public let averageEffortScore: Double?
    public let averageCaloriesKcal: Double?
    public let history: [NativeOverviewHistoryPoint]
    public let deepWorkMinutes: Double?
    public let calendarDeepWorkMinutes: Double?
    public let deepWorkSource: String
    public let focus: Double?
    public let energy: Double?
    public let activity: NativeOverviewActivity?
    public let provenance: NativeOverviewProvenance
}

public struct NativeOverviewHistoryPoint: Codable, Equatable, Sendable, Identifiable {
    public let date: String
    public let sleepMinutes: Double?
    public let recoveryScore: Double?
    public let effortScore: Double?
    public let caloriesKcal: Double?
    public let calorieTarget: Double?

    public var id: String { date }
}

/// Activity is optional and intentionally keeps the discriminant from the
/// web contract. The additional fields stay optional because each activity
/// kind has a different set of measurements.
public struct NativeOverviewActivity: Codable, Equatable, Sendable {
    public let kind: String
    public let distanceKm: Double?
    public let durationMinutes: Double?
    public let intensityMinutes: Double?
}

public struct NativeOverviewProvenance: Codable, Equatable, Sendable {
    public let sleep: NativeMetricProvenance
    public let sleepRegularity: NativeMetricProvenance
    public let recovery: NativeMetricProvenance
    public let effort: NativeMetricProvenance
    public let calories: NativeMetricProvenance
    public let calorieTarget: NativeMetricProvenance
    public let averages: NativeMetricProvenance
}

public struct NativeMetricProvenance: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case healthSource = "health_source"
        case somaCalculation = "soma_calculation"
        case somaMeals = "soma_meals"
    }

    public let kind: Kind
    public let label: String
}
