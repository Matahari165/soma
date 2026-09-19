import Foundation
import Testing
@testable import SomaCore

@Test func effortSnapshotKeepsMissingAndMeasuredZeroDistinct() throws {
    let json = #"{"timezone":"Europe/Zurich","period":{"days":30,"startDate":"2026-08-20","endDate":"2026-09-18"},"latestObservedDate":"2026-09-18","importedAt":null,"measuredAt":"2026-09-18T20:00:00Z","latest":{"date":"2026-09-18","steps":0,"exerciseMinutes":null,"activeEnergyKcal":0,"zoneMinutes":null,"weeklyLoad":null,"acuteChronicLoadRatio":null,"zones":{"light":0,"moderate":null,"vigorous":null,"peak":null},"provenance":"google_health"},"score":{"value":0,"date":"2026-09-18","coverage":0.5,"algorithmVersion":"effort-v3","provenance":"soma_calculation"},"coverage":{"expectedDays":30,"observedActivityDays":1,"byMetric":{"steps":0.03}},"trends":[{"date":"2026-09-18","steps":0,"exerciseMinutes":null,"activeEnergyKcal":0,"zoneMinutes":null}],"exercises":[]}"#
    let snapshot = try JSONDecoder().decode(EffortSnapshot.self, from: Data(json.utf8))

    #expect(snapshot.latest?.steps == 0)
    #expect(snapshot.latest?.exerciseMinutes == nil)
    #expect(snapshot.latest?.zones.light == 0)
    #expect(snapshot.latest?.zones.moderate == nil)
    #expect(snapshot.score?.value == 0)
}

@Test func emptyEffortSnapshotDoesNotInventActivity() throws {
    let json = #"{"timezone":"Europe/Zurich","period":null,"latestObservedDate":null,"importedAt":null,"measuredAt":null,"latest":null,"score":null,"coverage":{"expectedDays":30,"observedActivityDays":0,"byMetric":{}},"trends":[],"exercises":[]}"#
    let snapshot = try JSONDecoder().decode(EffortSnapshot.self, from: Data(json.utf8))

    #expect(snapshot.latest == nil)
    #expect(snapshot.score == nil)
    #expect(snapshot.coverage.observedActivityDays == 0)
}

@Test func effortZonesAreVisibleOnlyWhenAtLeastOneZoneWasMeasured() {
    #expect(!EffortZones(light: nil, moderate: nil, vigorous: nil, peak: nil).hasMeasurements)
    #expect(EffortZones(light: 0, moderate: nil, vigorous: nil, peak: nil).hasMeasurements)
}
