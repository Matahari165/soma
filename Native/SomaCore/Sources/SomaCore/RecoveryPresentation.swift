import Foundation

public struct RecoveryPresentation: Equatable, Sendable {
    public let indicator: DataAvailability<DomainIndicatorPresentation>
    public let hrvTrend: DataAvailability<TimeSeriesPresentation>
    public let restingHeartRateTrend: DataAvailability<TimeSeriesPresentation>

    public init(response: NativeRecoveryResponse) {
        let components = [
            MetricComponentPresentation(
                id: "hrv",
                label: "VFC nocturne",
                rawValueLabel: Self.valueLabel(response.signals.hrv.current, unit: response.signals.hrv.unit),
                normalizedValue: response.score.components.hrv.value,
                targetLabel: Self.referenceLabel(response.signals.hrv),
                weight: response.score.components.hrv.weight,
                contribution: nil,
                provenance: .healthSource(name: response.provenance.measurements.label)
            ),
            MetricComponentPresentation(
                id: "resting-heart-rate",
                label: "Fréquence cardiaque au repos",
                rawValueLabel: Self.valueLabel(response.signals.restingHeartRate.current, unit: response.signals.restingHeartRate.unit),
                normalizedValue: response.score.components.restingHeartRate.value,
                targetLabel: Self.referenceLabel(response.signals.restingHeartRate),
                weight: response.score.components.restingHeartRate.weight,
                contribution: nil,
                provenance: .healthSource(name: response.provenance.measurements.label)
            ),
            MetricComponentPresentation(
                id: "sleep",
                label: "Sommeil",
                rawValueLabel: response.score.components.sleep.value.map { "\($0.formatted(.number.precision(.fractionLength(0)))) / 100" },
                normalizedValue: response.score.components.sleep.value,
                targetLabel: nil,
                weight: response.score.components.sleep.weight,
                contribution: nil,
                provenance: .somaCalculation(version: nil)
            ),
        ]

        if let score = response.score.value {
            let average = response.score.average.map { "Moyenne personnelle \($0.formatted(.number.precision(.fractionLength(0)))) / 100 · n=\(response.score.measuredDays)" }
                ?? "Moyenne personnelle indisponible"
            let presentation = DomainIndicatorPresentation(
                domain: .recovery,
                title: "Score de récupération",
                score: score,
                scoreLabel: "\(score.formatted(.number.precision(.fractionLength(0)))) / 100",
                detail: average,
                coverage: response.score.coverage,
                provenance: .somaCalculation(version: response.score.algorithmVersion),
                components: components
            )
            indicator = response.freshness.state == .current
                ? .available(presentation)
                : .partial(presentation, note: Self.freshnessNote(response.freshness.state))
        } else {
            indicator = .unavailable(reason: response.score.reason ?? "Le score ne peut pas être calculé avec les mesures disponibles.")
        }

        hrvTrend = Self.trend(
            title: "VFC nocturne",
            unit: response.signals.hrv.unit,
            points: response.trends.hrv,
            periodDays: response.periodDays,
            provenance: response.provenance.measurements.label,
            freshness: response.freshness.state
        )
        restingHeartRateTrend = Self.trend(
            title: "Fréquence cardiaque au repos",
            unit: response.signals.restingHeartRate.unit,
            points: response.trends.restingHeartRate,
            periodDays: response.periodDays,
            provenance: response.provenance.measurements.label,
            freshness: response.freshness.state
        )
    }

    private static func trend(title: String, unit: String, points: [RecoveryTrendPoint], periodDays: Int, provenance: String, freshness: RecoveryFreshness.State) -> DataAvailability<TimeSeriesPresentation> {
        let chartPoints = points.map { point in
            ChartPoint(
                id: "\(title)-\(point.date)",
                date: date(point.date),
                value: point.value,
                label: point.date
            )
        }
        guard chartPoints.contains(where: { $0.value != nil }) else {
            return .unavailable(reason: "Aucune mesure sur les \(periodDays) derniers jours.")
        }
        let presentation = TimeSeriesPresentation(
            title: title,
            unit: unit,
            periodLabel: "\(periodDays) jours",
            series: [.init(id: title, label: "Mesurée", points: chartPoints, provenance: .healthSource(name: provenance))]
        )
        let missing = chartPoints.count(where: { $0.value == nil })
        if missing > 0 || freshness != .current {
            let gap = missing > 0 ? "\(missing) jour\(missing == 1 ? "" : "s") sans mesure" : freshnessNote(freshness)
            return .partial(presentation, note: gap)
        }
        return .available(presentation)
    }

    private static func date(_ value: String) -> Date {
        (try? Date(value, strategy: .iso8601.year().month().day())) ?? .distantPast
    }

    private static func valueLabel(_ value: Double?, unit: String) -> String? {
        value.map { "\($0.formatted(.number.precision(.fractionLength(0)))) \(unit)" }
    }

    private static func referenceLabel(_ signal: RecoverySignal) -> String? {
        guard let reference = signal.reference else { return nil }
        return "Référence \(reference.formatted(.number.precision(.fractionLength(0)))) \(signal.unit) · n=\(signal.measuredDays)"
    }

    private static func freshnessNote(_ state: RecoveryFreshness.State) -> String {
        switch state {
        case .current: "Données à jour"
        case .partial: "Données partielles"
        case .stale: "Données anciennes"
        case .missing: "Fraîcheur indisponible"
        }
    }
}
