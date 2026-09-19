import SomaCore
import SwiftUI

struct SleepEvidenceView: View {
    let response: NativeSleepResponse
    let day: SleepMetricDay

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Couverture et provenance")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            LabeledContent("Couverture") {
                Text("\(response.measuredNightCount)/\(response.days.count) nuits").font(.body.monospacedDigit())
            }
            LabeledContent("Dernière mesure") {
                Text(measuredAt).font(.body.monospacedDigit())
            }
            LabeledContent("Dernier import") {
                Text(importedAt).font(.body.monospacedDigit())
            }
            LabeledContent("Fraîcheur") {
                Label(freshness.label, systemImage: freshness.icon)
                    .foregroundStyle(freshness.isStale ? SomaTheme.warning : SomaTheme.secondary)
            }
            Divider().overlay(SomaTheme.rule)
            Label("Durées, horaires et phases : source santé", systemImage: "heart.text.clipboard")
            Label("Régularité, dette et score : calcul Soma", systemImage: "function")
        }
        .font(.callout)
    }

    private var measuredAt: String {
        SleepFormatting.dateTime(day.sourceFreshness?.latestMeasuredAt, timeZone: response.timezone) ?? "Indisponible"
    }

    private var importedAt: String {
        SleepFormatting.dateTime(response.importedAt, timeZone: response.timezone) ?? "Import non daté"
    }

    private var freshness: (label: String, icon: String, isStale: Bool) {
        guard let date = SleepFormatting.instant(response.importedAt) else {
            return ("Inconnue", "questionmark.circle", false)
        }
        let hours = Date.now.timeIntervalSince(date) / 3_600
        if hours > 36 { return ("Données anciennes", "exclamationmark.triangle", true) }
        return ("Import récent", "checkmark.circle", false)
    }
}
