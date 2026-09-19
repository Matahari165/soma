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
                ForEach(series.points) { point in
                    if let value = point.value {
                        LineMark(x: .value("Date", point.date), y: .value(presentation.unit, value), series: .value("Serie", series.label))
                            .foregroundStyle(by: .value("Serie", series.label))
                            .lineStyle(StrokeStyle(lineWidth: 2, dash: series.lineStyle == .dashed ? [6, 5] : []))
                        PointMark(x: .value("Date", point.date), y: .value(presentation.unit, value))
                            .symbol(by: .value("Serie", series.label))
                            .foregroundStyle(by: .value("Serie", series.label))
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
            let observed = series.points.compactMap(\.value)
            guard let first = observed.first, let last = observed.last else { return "\(series.label), aucune mesure" }
            return "\(series.label), de \(first.formatted()) a \(last.formatted()) \(presentation.unit)"
        }
        return ([presentation.title] + summaries).joined(separator: ". ")
    }
}
