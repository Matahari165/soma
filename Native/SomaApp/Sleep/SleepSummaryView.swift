import SomaCore
import SwiftUI

struct SleepSummaryView: View {
    let day: SleepMetricDay
    let score: SleepScoreDay?
    let timeZone: String

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Dernière nuit")
                .font(.system(.title2, design: .serif))
                .accessibilityAddTraits(.isHeader)
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 144), spacing: 24, alignment: .topLeading)],
                alignment: .leading,
                spacing: 16
            ) { metrics }
            if let bedtime = SleepFormatting.time(day.bedtime, timeZone: timeZone), let wakeTime = SleepFormatting.time(day.wakeTime, timeZone: timeZone) {
                Label("\(bedtime) → \(wakeTime) · nuit du \(SleepFormatting.date(day.metricDate))", systemImage: "clock")
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(SomaTheme.secondary)
                    .accessibilityLabel("Coucher à \(bedtime), réveil à \(wakeTime), nuit associée au \(SleepFormatting.date(day.metricDate))")
            } else {
                Label("Horaires indisponibles", systemImage: "clock.badge.questionmark")
                    .foregroundStyle(SomaTheme.secondary)
            }
        }
    }

    @ViewBuilder private var metrics: some View {
        SleepMetricReading(label: "Durée", value: SleepFormatting.duration(day.sleepMinutes), provenance: "Source santé")
        SleepMetricReading(label: "Régularité", value: SleepFormatting.percent(day.sleepRegularity), provenance: "Calcul Soma")
        SleepMetricReading(label: "Efficacité", value: SleepFormatting.percent(day.sleepEfficiency), provenance: "Source santé")
        SleepMetricReading(label: "Score", value: SleepFormatting.score(score?.score), provenance: score?.algorithmVersion.map { "Calcul Soma · \($0)" } ?? "Calcul Soma")
    }
}

private struct SleepMetricReading: View {
    let label: String
    let value: String
    let provenance: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.caption.monospaced())
                .foregroundStyle(SomaTheme.secondary)
            Text(value)
                .font(.system(.title, design: .monospaced))
                .foregroundStyle(value == "—" ? SomaTheme.secondary : SomaTheme.primary)
            Text(provenance)
                .font(.caption)
                .foregroundStyle(SomaTheme.secondary)
        }
        .frame(minWidth: 112, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
