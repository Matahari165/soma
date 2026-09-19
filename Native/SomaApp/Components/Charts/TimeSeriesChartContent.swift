import Charts
import SomaCore
import SwiftUI

struct TimeSeriesChartContent: View {
    let presentation: TimeSeriesPresentation
    let partialNote: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text(presentation.title).font(.headline)
                Spacer()
                Text(presentation.periodLabel)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(SomaTheme.secondary)
            }
            Chart(presentation.series) { series in
                ForEach(series.measuredSegments) { segment in
                    ForEach(segment.points) { point in
                        if let value = point.value {
                            LineMark(x: .value("Date", point.date), y: .value(presentation.unit, value), series: .value("Segment", segment.id))
                                .foregroundStyle(by: .value("Serie", series.label))
                                .lineStyle(StrokeStyle(lineWidth: 2, dash: series.lineStyle == .dashed ? [6, 5] : []))
                            PointMark(x: .value("Date", point.date), y: .value(presentation.unit, value))
                                .symbol(by: .value("Serie", series.label))
                                .foregroundStyle(by: .value("Serie", series.label))
                        }
                    }
                }
            }
            .chartForegroundStyleScale(range: [SomaTheme.primary, SomaTheme.secondary, SomaTheme.signal])
            .chartLegend(position: .bottom, alignment: .leading, spacing: 12)
            .chartYAxis { AxisMarks(position: .leading) }
            .frame(minHeight: 180, idealHeight: 220)
            .accessibilityLabel(accessibilitySummary)
            if let partialNote {
                Label(partialNote, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.warning)
            }
            ForEach(presentation.series) { series in
                ChartProvenanceLabel(provenance: series.provenance)
            }
        }
    }

    private var accessibilitySummary: String {
        let summaries = presentation.series.map { series in
            let observedPoints = series.points.filter { $0.value != nil }
            guard let firstPoint = observedPoints.first,
                  let lastPoint = observedPoints.last,
                  let firstValue = firstPoint.value,
                  let lastValue = lastPoint.value else {
                return "\(series.label), aucune mesure sur \(presentation.periodLabel)"
            }
            let missingCount = series.points.count - observedPoints.count
            let missingSummary = missingCount == 0 ? "aucune mesure manquante" : "\(missingCount) mesure(s) manquante(s)"
            return "\(series.label), \(observedPoints.count) mesures sur \(presentation.periodLabel), du \(firstPoint.date.formatted(date: .abbreviated, time: .omitted)) au \(lastPoint.date.formatted(date: .abbreviated, time: .omitted)), de \(firstValue.formatted()) à \(lastValue.formatted()) \(presentation.unit), \(missingSummary)"
        }
        return ([presentation.title] + summaries).joined(separator: ". ")
    }
}
