import Foundation

public struct NativeSleepResponse: Codable, Equatable, Sendable {
    public let timezone: String
    public let importedAt: String?
    public let days: [SleepMetricDay]
    public let scores: [SleepScoreDay]
    public let sleepRecommendation: SleepRecommendation?
    public let latestSleepStages: [SleepStageSegment]

    public var latestMeasuredDay: SleepMetricDay? {
        days.last(where: \.hasMeasurement)
    }

    public var latestScore: SleepScoreDay? {
        guard let date = latestMeasuredDay?.metricDate else { return nil }
        return scores.last { $0.kind == "sleep" && $0.scoreDate == date }
    }

    public var measuredNightCount: Int {
        days.count(where: { $0.sleepMinutes != nil })
    }
}

public struct SleepMetricDay: Codable, Equatable, Identifiable, Sendable {
    public let metricDate: String
    public let sleepMinutes: Double?
    public let sleepNeedMinutes: Double?
    public let sleepEfficiency: Double?
    public let sleepRegularity: Double?
    public let sleepLatencyMinutes: Double?
    public let sleepAwakeMinutes: Double?
    public let sleepAwakePercent: Double?
    public let sleepFragmentation: Double?
    public let sleepDeepMinutes: Double?
    public let sleepDeepPercent: Double?
    public let sleepREMMinutes: Double?
    public let sleepREMPercent: Double?
    public let sleepLightMinutes: Double?
    public let sleepLightPercent: Double?
    public let cumulativeSleepDebtMinutes: Double?
    public let bedtime: String?
    public let wakeTime: String?
    public let sourceFreshness: SleepSourceFreshness?

    public var id: String { metricDate }
    public var hasMeasurement: Bool {
        [
            sleepMinutes,
            sleepEfficiency,
            sleepRegularity,
            sleepLatencyMinutes,
            sleepAwakeMinutes,
            sleepAwakePercent,
            sleepFragmentation,
            sleepDeepMinutes,
            sleepDeepPercent,
            sleepREMMinutes,
            sleepREMPercent,
            sleepLightMinutes,
            sleepLightPercent,
        ].contains { $0 != nil }
    }

    enum CodingKeys: String, CodingKey {
        case metricDate = "metric_date"
        case sleepMinutes = "sleep_minutes"
        case sleepNeedMinutes = "sleep_need_minutes"
        case sleepEfficiency = "sleep_efficiency"
        case sleepRegularity = "sleep_regularity"
        case sleepLatencyMinutes = "sleep_latency_minutes"
        case sleepAwakeMinutes = "sleep_awake_minutes"
        case sleepAwakePercent = "sleep_awake_percent"
        case sleepFragmentation = "sleep_fragmentation"
        case sleepDeepMinutes = "sleep_deep_minutes"
        case sleepDeepPercent = "sleep_deep_percent"
        case sleepREMMinutes = "sleep_rem_minutes"
        case sleepREMPercent = "sleep_rem_percent"
        case sleepLightMinutes = "sleep_light_minutes"
        case sleepLightPercent = "sleep_light_percent"
        case cumulativeSleepDebtMinutes = "cumulative_sleep_debt_minutes"
        case bedtime
        case wakeTime = "wake_time"
        case sourceFreshness = "source_freshness"
    }
}

public struct SleepSourceFreshness: Codable, Equatable, Sendable {
    public let latestMeasuredAt: String?
    public let byType: [String: String?]?
}

public struct SleepScoreDay: Codable, Equatable, Sendable {
    public let scoreDate: String
    public let kind: String
    public let score: Double?
    public let algorithmVersion: String?

    enum CodingKeys: String, CodingKey {
        case scoreDate = "score_date"
        case kind, score
        case algorithmVersion = "algorithm_version"
    }
}

public struct SleepRecommendation: Codable, Equatable, Sendable {
    public let bedtimeMinutes: Double
    public let wakeTimeMinutes: Double
    public let sleepNeedMinutes: Double
}

public struct SleepStageSegment: Codable, Equatable, Sendable {
    public let type: String
    public let startTime: String
    public let endTime: String
}
