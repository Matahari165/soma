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
