import SomaCore
import SwiftUI

struct SleepHistoryView: View {
    let response: NativeSleepResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            TimeSeriesChart(data: availability)
            Text("Les interruptions représentent des nuits sans mesure, jamais des valeurs nulles transformées en zéro.")
                .font(.caption)
                .foregroundStyle(SomaTheme.secondary)
        }
    }

    private var availability: DataAvailability<TimeSeriesPresentation> {
        let points = response.days.map { day in
            ChartPoint(
                id: day.metricDate,
                date: SleepFormatting.day(day.metricDate),
                value: day.sleepMinutes.map { $0 / 60 },
                label: day.sleepMinutes.map(SleepFormatting.duration) ?? "Non mesuré"
            )
        }
        let presentation = TimeSeriesPresentation(
            title: "Historique",
            unit: "heures",
            periodLabel: "\(response.measuredNightCount)/\(response.days.count) nuits",
            series: [TimeSeries(id: "sleep-duration", label: "Durée", points: points, provenance: .healthSource(name: "Données Santé"))]
        )
        guard points.contains(where: { $0.value != nil }) else {
            return .unavailable(reason: "Aucune durée mesurée")
        }
        let missing = points.count(where: { $0.value == nil })
        return missing == 0 ? .available(presentation) : .partial(presentation, note: "\(missing) nuit(s) sans durée mesurée")
    }
}
