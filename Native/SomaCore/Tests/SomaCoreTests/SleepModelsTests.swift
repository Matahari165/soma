import Foundation
import Testing
@testable import SomaCore

@Test func sleepResponseKeepsMissingAndExplicitZeroDistinct() throws {
    let json = #"{"timezone":"Europe/Zurich","importedAt":"2026-09-19T05:00:00Z","days":[{"metric_date":"2026-09-18","sleep_minutes":null,"sleep_need_minutes":510,"sleep_efficiency":null,"sleep_regularity":null,"sleep_latency_minutes":null,"sleep_awake_minutes":null,"sleep_awake_percent":null,"sleep_fragmentation":null,"sleep_deep_minutes":null,"sleep_deep_percent":null,"sleep_rem_minutes":null,"sleep_rem_percent":null,"sleep_light_minutes":null,"sleep_light_percent":null,"cumulative_sleep_debt_minutes":null,"bedtime":null,"wake_time":null,"source_freshness":null},{"metric_date":"2026-09-19","sleep_minutes":0,"sleep_need_minutes":510,"sleep_efficiency":0,"sleep_regularity":null,"sleep_latency_minutes":0,"sleep_awake_minutes":0,"sleep_awake_percent":0,"sleep_fragmentation":0,"sleep_deep_minutes":0,"sleep_deep_percent":0,"sleep_rem_minutes":0,"sleep_rem_percent":0,"sleep_light_minutes":0,"sleep_light_percent":0,"cumulative_sleep_debt_minutes":0,"bedtime":"2026-09-18T22:30:00Z","wake_time":"2026-09-19T07:00:00Z","source_freshness":{"latestMeasuredAt":"2026-09-19T07:00:00Z"}}],"scores":[],"sleepRecommendation":null,"latestSleepStages":[]}"#
    let response = try JSONDecoder().decode(NativeSleepResponse.self, from: Data(json.utf8))
    #expect(response.days[0].sleepMinutes == nil)
    #expect(response.days[1].sleepMinutes == 0)
    #expect(response.days[1].sleepRegularity == nil)
    #expect(response.measuredNightCount == 1)
}

@Test func latestSleepDayCanCrossMidnightWithoutChangingItsCivilDate() throws {
    let json = #"{"timezone":"Europe/Zurich","importedAt":null,"days":[{"metric_date":"2026-09-19","sleep_minutes":480,"sleep_need_minutes":510,"sleep_efficiency":94,"sleep_regularity":82,"sleep_latency_minutes":12,"sleep_awake_minutes":18,"sleep_awake_percent":4,"sleep_fragmentation":1.1,"sleep_deep_minutes":90,"sleep_deep_percent":19,"sleep_rem_minutes":110,"sleep_rem_percent":23,"sleep_light_minutes":280,"sleep_light_percent":58,"cumulative_sleep_debt_minutes":30,"bedtime":"2026-09-18T22:40:00Z","wake_time":"2026-09-19T06:58:00Z","source_freshness":null}],"scores":[{"score_date":"2026-09-19","kind":"sleep","score":84,"algorithm_version":"sleep-v0.2"}],"sleepRecommendation":null,"latestSleepStages":[]}"#
    let response = try JSONDecoder().decode(NativeSleepResponse.self, from: Data(json.utf8))
    #expect(response.latestMeasuredDay?.metricDate == "2026-09-19")
    #expect(response.latestMeasuredDay?.bedtime?.contains("2026-09-18") == true)
    #expect(response.latestScore?.score == 84)
}

@Test func partialSleepStageStillCountsAsAMeasuredNight() throws {
    let json = #"{"timezone":"Europe/Zurich","importedAt":null,"days":[{"metric_date":"2026-09-19","sleep_minutes":null,"sleep_need_minutes":510,"sleep_efficiency":null,"sleep_regularity":null,"sleep_latency_minutes":null,"sleep_awake_minutes":null,"sleep_awake_percent":null,"sleep_fragmentation":null,"sleep_deep_minutes":null,"sleep_deep_percent":null,"sleep_rem_minutes":null,"sleep_rem_percent":null,"sleep_light_minutes":35,"sleep_light_percent":null,"cumulative_sleep_debt_minutes":null,"bedtime":null,"wake_time":null,"source_freshness":null}],"scores":[],"sleepRecommendation":null,"latestSleepStages":[]}"#
    let response = try JSONDecoder().decode(NativeSleepResponse.self, from: Data(json.utf8))
    #expect(response.latestMeasuredDay?.metricDate == "2026-09-19")
}
