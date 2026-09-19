import SomaCore
import SwiftUI

struct ActivityView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScreenScaffold(title: "Effort", context: "30 jours") {
            switch model.effortState {
            case .idle, .loading:
                ContentStateView(kind: .loading("Chargement de l’effort…"))
            case .failed(let message):
                ContentStateView(kind: .error(message: message, retry: { Task { await model.refreshEffort() } }))
            case .loaded(let snapshot):
                EffortContent(snapshot: snapshot)
            }
        }
        .task { if case .idle = model.effortState { await model.refreshEffort() } }
    }
}

private struct EffortContent: View {
    let snapshot: EffortSnapshot

    var body: some View {
        if snapshot.latest == nil {
            ContentStateView(kind: .empty(title: "Aucune activité importée", detail: "Soma n’a reçu aucune mesure d’effort sur cette période. Une absence n’est pas affichée comme zéro."))
            evidence
        } else {
            LazyVStack(alignment: .leading, spacing: 32) {
                summary
                latestMetrics
                if let exercise = snapshot.exercises.first { EffortExerciseView(exercise: exercise) }
                trends
                if let zones = snapshot.latest?.zones, zones.hasMeasurements { zoneDistribution(zones) }
                evidence
            }
        }
    }

    private var summary: some View {
        let availability: DataAvailability<DomainIndicatorPresentation> = if let score = snapshot.score {
            if let coverage = score.coverage {
                coverage < 1 ? .partial(indicator(score, coverage: coverage), note: "Score calculé avec une couverture partielle") : .available(indicator(score, coverage: coverage))
            } else {
                .partial(indicator(score, coverage: nil), note: "Couverture du score indisponible")
            }
        } else {
            .unavailable(reason: "Pas assez de composantes mesurées pour calculer le score")
        }
        return DomainIndicatorBlock(data: availability)
    }

    private func indicator(_ score: EffortScore, coverage: Double?) -> DomainIndicatorPresentation {
        .init(domain: .effort, title: "Score d’effort", score: score.value, scoreLabel: "\(score.value.formatted(.number.precision(.fractionLength(0)))) / 100", detail: "Mesuré le \(score.date)", coverage: coverage, provenance: .somaCalculation(version: score.algorithmVersion))
    }

    private var latestMetrics: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader("Dernière journée mesurée", trailing: snapshot.latestObservedDate)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 16)], alignment: .leading, spacing: 20) {
                metric("Pas", snapshot.latest?.steps, unit: "pas")
                metric("Exercice", snapshot.latest?.exerciseMinutes, unit: "min")
                metric("Énergie active", snapshot.latest?.activeEnergyKcal, unit: "kcal")
                metric("Zones", snapshot.latest?.zoneMinutes, unit: "min")
                if let load = snapshot.latest?.weeklyLoad { metric("Charge hebdomadaire", load, unit: "pts", calculated: true) }
                if let ratio = snapshot.latest?.acuteChronicLoadRatio { metric("Ratio aigu / chronique", ratio, unit: "×", calculated: true) }
            }
        }
    }

    private var trends: some View {
        VStack(alignment: .leading, spacing: 20) {
            sectionHeader("Tendances", trailing: "30 jours")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 24)], alignment: .leading, spacing: 32) {
                trend(title: "Pas", unit: "pas", keyPath: \.steps)
                trend(title: "Durée d’exercice", unit: "min", keyPath: \.exerciseMinutes)
                trend(title: "Énergie active", unit: "kcal", keyPath: \.activeEnergyKcal)
                trend(title: "Minutes de zone", unit: "min", keyPath: \.zoneMinutes)
            }
        }
    }

    private func trend(title: String, unit: String, keyPath: KeyPath<EffortTrendDay, Double?>) -> some View {
        let points = snapshot.trends.compactMap { day -> ChartPoint? in
            guard let date = Self.dayFormatter.date(from: day.date) else { return nil }
            return ChartPoint(id: "\(title)-\(day.date)", date: date, value: day[keyPath: keyPath], label: day.date)
        }
        let presentation = TimeSeriesPresentation(title: title, unit: unit, periodLabel: "30 jours", series: [TimeSeries(id: title, label: title, points: points, provenance: .healthSource(name: "Données Santé"))])
        let measured = points.filter { $0.value != nil }.count
        return TimeSeriesChart(data: measured == points.count ? .available(presentation) : .partial(presentation, note: "\(points.count - measured) jour(s) sans mesure"))
    }

    private func zoneDistribution(_ zones: EffortZones) -> some View {
        let segments = [
            SegmentDatum(id: "light", label: "Légère", value: zones.light, unit: "min"),
            SegmentDatum(id: "moderate", label: "Modérée", value: zones.moderate, unit: "min"),
            SegmentDatum(id: "vigorous", label: "Vigoureuse", value: zones.vigorous, unit: "min"),
            SegmentDatum(id: "peak", label: "Pic", value: zones.peak, unit: "min"),
        ]
        let presentation = SegmentedBarPresentation(title: "Répartition des zones", totalLabel: snapshot.latest?.zoneMinutes.map { "\($0.formatted(.number.precision(.fractionLength(0)))) min" }, segments: segments, provenance: .healthSource(name: "Données Santé"))
        return SegmentedBarChart(data: segments.contains { $0.value == nil } ? .partial(presentation, note: "Certaines zones ne sont pas mesurées") : .available(presentation))
    }

    private var evidence: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Preuve des données")
            Text("\(snapshot.coverage.observedActivityDays) jours observés sur \(snapshot.coverage.expectedDays)").font(.system(.body, design: .monospaced))
            if let measuredAt = snapshot.measuredAt { Text("Dernière mesure · \(measuredAt)") }
            if let importedAt = snapshot.importedAt { Text("Dernier import · \(importedAt)") }
            Label(freshnessIsStale ? "Données possiblement obsolètes" : "Données récentes", systemImage: freshnessIsStale ? "clock.badge.exclamationmark" : "checkmark.circle")
                .foregroundStyle(freshnessIsStale ? SomaTheme.warning : SomaTheme.secondary)
            ChartProvenanceLabel(provenance: .healthSource(name: "Données Santé"))
            Text("Charge et score, lorsqu’ils existent, sont calculés par Soma.").font(.caption).foregroundStyle(SomaTheme.secondary)
        }
        .font(.caption)
        .foregroundStyle(SomaTheme.secondary)
        .accessibilityElement(children: .combine)
    }

    private var freshnessIsStale: Bool {
        guard let value = snapshot.measuredAt, let date = ISO8601DateFormatter().date(from: value) else { return true }
        return Date().timeIntervalSince(date) > 48 * 60 * 60
    }

    private func metric(_ label: String, _ value: Double?, unit: String, calculated: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(SomaTheme.secondary)
            if let value {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) { formatted(value, unit: unit); Text(unit).foregroundStyle(SomaTheme.secondary) }
                    VStack(alignment: .leading, spacing: 2) { formatted(value, unit: unit); Text(unit).foregroundStyle(SomaTheme.secondary) }
                }
                .font(.system(.title2, design: .monospaced))
            } else {
                Text("Indisponible").foregroundStyle(SomaTheme.secondary)
            }
            Text(calculated ? "Calculé par Soma" : "Source santé").font(.caption2).foregroundStyle(SomaTheme.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func formatted(_ value: Double, unit: String) -> Text {
        Text(value.formatted(.number.precision(.fractionLength(unit == "×" ? 2 : 0))))
    }

    private func sectionHeader(_ title: String, trailing: String? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.system(.title2, design: .serif)).accessibilityAddTraits(.isHeader)
            Spacer()
            if let trailing { Text(trailing).font(.caption.monospacedDigit()).foregroundStyle(SomaTheme.secondary) }
        }
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

private struct EffortExerciseView: View {
    let exercise: EffortExercise

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text("Séance récente").font(.system(.title2, design: .serif)).accessibilityAddTraits(.isHeader)
                Spacer()
                Text(exercise.date).font(.caption.monospacedDigit()).foregroundStyle(SomaTheme.secondary)
            }
            Text(exercise.name).font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 16)], alignment: .leading, spacing: 12) {
                value("Durée", exercise.durationMinutes, "min")
                value("Calories", exercise.calories, "kcal")
                value("Distance", exercise.distanceKm, "km", digits: 2)
                value("FC moyenne", exercise.averageHeartRate, "bpm")
                value("Zones", exercise.zoneMinutes, "min")
            }
            ChartProvenanceLabel(provenance: .healthSource(name: "Données Santé"))
        }
    }

    @ViewBuilder private func value(_ label: String, _ number: Double?, _ unit: String, digits: Int = 0) -> some View {
        if let number {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(.caption).foregroundStyle(SomaTheme.secondary)
                Text("\(number.formatted(.number.precision(.fractionLength(digits)))) \(unit)").font(.body.monospacedDigit())
            }
            .accessibilityElement(children: .combine)
        }
    }
}
