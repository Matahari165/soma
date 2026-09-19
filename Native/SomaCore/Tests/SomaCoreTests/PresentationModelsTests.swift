import Foundation
import Testing
@testable import SomaCore

@Test func availabilityKeepsZeroDistinctFromUnavailable() {
    let measuredZero = DataAvailability<Double>.available(0)
    let unavailable = DataAvailability<Double>.unavailable(reason: "Non mesure")

    #expect(measuredZero.value == 0)
    #expect(unavailable.value == nil)
}

@Test func partialAvailabilityRetainsValueAndWarningState() {
    let partial = DataAvailability<Double>.partial(7.25, note: "Une nuit sans mesure")

    #expect(partial.value == 7.25)
    #expect(partial.isPartial)
}

@Test func provenanceDistinguishesHealthSourceFromSomaCalculation() {
    let measured = DataProvenance.healthSource(name: "Donnees Sante")
    let calculated = DataProvenance.somaCalculation(version: "recovery-v1")

    #expect(measured != calculated)
    #expect(measured.label.contains("Source sante"))
    #expect(calculated.label == "Calcule par Soma")
}

@Test func chartPointCanRepresentMissingAndMeasuredZero() {
    let date = Date(timeIntervalSince1970: 0)
    let points = [
        ChartPoint(id: "missing", date: date, value: nil, label: "Absent"),
        ChartPoint(id: "zero", date: date, value: 0, label: "Zero mesure"),
    ]

    #expect(points[0].value == nil)
    #expect(points[1].value == 0)
}

@Test func domainIndicatorDoesNotClampItsSourceData() {
    let indicator = DomainIndicatorPresentation(domain: .effort, title: "Effort", score: 0, scoreLabel: "0 / 100", detail: "Repos mesure", coverage: 1, provenance: .somaCalculation(version: nil))

    #expect(indicator.score == 0)
    #expect(indicator.coverage == 1)
}

@Test func strongestEffectKeepsEvidenceMetadata() {
    let effect = StrongestEffectPresentation(id: "walk-sleep", predictor: "Marche", outcome: "Sommeil", effect: 0.31, confidenceRange: 0.12...0.48, sampleSize: 28, lagLabel: "le lendemain", periodLabel: "30 jours", direction: .favorable, qValue: 0.02, stability: 0.84)

    #expect(effect.sampleSize == 28)
    #expect(effect.confidenceRange?.lowerBound == 0.12)
    #expect(effect.periodLabel == "30 jours")
    #expect(effect.qValue == 0.02)
}

@Test func segmentKeepsMissingDistinctFromMeasuredZero() {
    let segments = [SegmentDatum(id: "missing", label: "Absent", value: nil, unit: "%"), SegmentDatum(id: "zero", label: "Zero", value: 0, unit: "%")]

    #expect(segments[0].value == nil)
    #expect(segments[1].value == 0)
}

@Test func timeSeriesBreaksTheLineAcrossMissingMeasurements() {
    let date = Date(timeIntervalSince1970: 0)
    let series = TimeSeries(id: "sleep", label: "Sommeil", points: [
        ChartPoint(id: "one", date: date, value: 7, label: "Jour 1"),
        ChartPoint(id: "missing", date: date, value: nil, label: "Jour 2"),
        ChartPoint(id: "three", date: date, value: 8, label: "Jour 3"),
    ], provenance: .healthSource(name: "Donnees Sante"))

    #expect(series.measuredSegments.count == 2)
    #expect(series.measuredSegments.map(\.points.count) == [1, 1])
}

@Test func recoveryResponseKeepsMissingSignalsAndMeasuredZeroDistinct() throws {
    let json = #"{"timezone":"Europe/Zurich","periodDays":30,"latestDate":"2026-09-19","freshness":{"measuredAt":null,"importedAt":null,"state":"partial","coverage":0.3333333333},"score":{"value":null,"reason":"La fréquence cardiaque au repos est absente.","average":null,"measuredDays":0,"coverage":0.3333333333,"algorithmVersion":"recovery-v1","components":{"hrv":{"value":null,"weight":0.4},"restingHeartRate":{"value":null,"weight":0.3},"sleep":{"value":null,"weight":0.3}}},"signals":{"hrv":{"current":0,"reference":48,"measuredDays":8,"unit":"ms"},"restingHeartRate":{"current":null,"reference":60,"measuredDays":8,"unit":"bpm"}},"trends":{"hrv":[{"date":"2026-09-18","value":null},{"date":"2026-09-19","value":0}],"restingHeartRate":[{"date":"2026-09-18","value":60},{"date":"2026-09-19","value":null}]},"provenance":{"measurements":{"kind":"health_source","label":"Sources santé importées"},"score":{"kind":"soma_calculation","label":"Calcul Soma"}}}"#
    let response = try JSONDecoder().decode(NativeRecoveryResponse.self, from: Data(json.utf8))

    #expect(response.signals.hrv.current == 0)
    #expect(response.signals.restingHeartRate.current == nil)
    #expect(response.trends.hrv[0].value == nil)
    #expect(response.trends.hrv[1].value == 0)
    #expect(response.score.value == nil)
}

@Test func recoveryPresentationNeverInventsAnUnavailableScore() throws {
    let json = #"{"timezone":"Europe/Zurich","periodDays":30,"latestDate":"2026-09-19","freshness":{"measuredAt":"2026-09-19T07:00:00.000Z","importedAt":"2026-09-19T08:00:00.000Z","state":"current","coverage":0.6666666667},"score":{"value":null,"reason":"Il faut au moins 7 mesures historiques de VFC.","average":null,"measuredDays":0,"coverage":0.6666666667,"algorithmVersion":"recovery-v1","components":{"hrv":{"value":null,"weight":0.4},"restingHeartRate":{"value":62,"weight":0.3},"sleep":{"value":71,"weight":0.3}}},"signals":{"hrv":{"current":52,"reference":51,"measuredDays":3,"unit":"ms"},"restingHeartRate":{"current":58,"reference":60,"measuredDays":8,"unit":"bpm"}},"trends":{"hrv":[{"date":"2026-09-19","value":52}],"restingHeartRate":[{"date":"2026-09-19","value":58}]},"provenance":{"measurements":{"kind":"health_source","label":"Sources santé importées"},"score":{"kind":"soma_calculation","label":"Calcul Soma"}}}"#
    let response = try JSONDecoder().decode(NativeRecoveryResponse.self, from: Data(json.utf8))
    let presentation = RecoveryPresentation(response: response)

    if case .unavailable(let reason) = presentation.indicator {
        #expect(reason.contains("7 mesures"))
    } else {
        Issue.record("Le score indisponible ne doit pas devenir une valeur numérique")
    }
}

@Test func recoveryPresentationExposesPersistedScoreCoverageAndReferences() throws {
    let json = #"{"timezone":"Europe/Zurich","periodDays":30,"latestDate":"2026-09-19","freshness":{"measuredAt":"2026-09-19T07:00:00.000Z","importedAt":"2026-09-19T08:00:00.000Z","state":"current","coverage":1},"score":{"value":74,"reason":null,"average":70,"measuredDays":24,"coverage":1,"algorithmVersion":"recovery-v1","components":{"hrv":{"value":78,"weight":0.4},"restingHeartRate":{"value":72,"weight":0.3},"sleep":{"value":70,"weight":0.3}}},"signals":{"hrv":{"current":57,"reference":52,"measuredDays":27,"unit":"ms"},"restingHeartRate":{"current":56,"reference":59,"measuredDays":29,"unit":"bpm"}},"trends":{"hrv":[{"date":"2026-09-18","value":55},{"date":"2026-09-19","value":57}],"restingHeartRate":[{"date":"2026-09-18","value":57},{"date":"2026-09-19","value":56}]},"provenance":{"measurements":{"kind":"health_source","label":"Sources santé importées"},"score":{"kind":"soma_calculation","label":"Calcul Soma"}}}"#
    let response = try JSONDecoder().decode(NativeRecoveryResponse.self, from: Data(json.utf8))
    let presentation = RecoveryPresentation(response: response)

    if case .available(let indicator) = presentation.indicator {
        #expect(indicator.score == 74)
        #expect(indicator.coverage == 1)
        #expect(indicator.components.first?.targetLabel?.contains("n=27") == true)
    } else {
        Issue.record("Le score persistant calculable doit rester disponible")
    }
}
