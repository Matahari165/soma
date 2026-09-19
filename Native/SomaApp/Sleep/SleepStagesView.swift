import SomaCore
import SwiftUI

struct SleepStagesView: View {
    let day: SleepMetricDay

    var body: some View {
        SegmentedBarChart(data: availability)
    }

    private var availability: DataAvailability<SegmentedBarPresentation> {
        let segments = [
            SegmentDatum(id: "deep", label: "Profond", value: day.sleepDeepMinutes, unit: "min"),
            SegmentDatum(id: "rem", label: "Paradoxal", value: day.sleepREMMinutes, unit: "min"),
            SegmentDatum(id: "light", label: "Léger", value: day.sleepLightMinutes, unit: "min"),
            SegmentDatum(id: "awake", label: "Éveillé", value: day.sleepAwakeMinutes, unit: "min"),
        ]
        guard segments.contains(where: { $0.value != nil }) else {
            return .unavailable(reason: "Phases non fournies par la source santé")
        }
        let presentation = SegmentedBarPresentation(
            title: "Phases de la nuit",
            totalLabel: SleepFormatting.duration(day.sleepMinutes),
            segments: segments,
            provenance: .healthSource(name: "Données Santé")
        )
        return segments.contains(where: { $0.value == nil })
            ? .partial(presentation, note: "Répartition partielle : certaines phases ne sont pas mesurées")
            : .available(presentation)
    }
}
