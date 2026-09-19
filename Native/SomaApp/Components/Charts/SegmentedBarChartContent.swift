import Charts
import SomaCore
import SwiftUI

struct SegmentedBarChartContent: View {
    let presentation: SegmentedBarPresentation
    let partialNote: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(presentation.title).font(.headline)
                Spacer()
                if let totalLabel = presentation.totalLabel {
                    Text(totalLabel).font(.caption.monospacedDigit()).foregroundStyle(SomaTheme.secondary)
                }
            }
            Chart(presentation.segments) { segment in
                if let value = segment.value {
                    BarMark(x: .value(segment.unit, value), y: .value("Ensemble", "Valeur"))
                        .foregroundStyle(by: .value("Segment", segment.label))
                }
            }
            .chartForegroundStyleScale(range: [SomaTheme.primary, SomaTheme.secondary, SomaTheme.signal, SomaTheme.warning])
            .chartLegend(.hidden)
            .frame(height: 28)
            .accessibilityHidden(true)
            ForEach(presentation.segments) { segment in
                LabeledContent(segment.label) {
                    if let value = segment.value {
                        Text("\(value.formatted()) \(segment.unit)").font(.body.monospacedDigit())
                    } else {
                        Text("Indisponible").foregroundStyle(SomaTheme.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
            }
            if let partialNote {
                Label(partialNote, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.warning)
            }
            ChartProvenanceLabel(provenance: presentation.provenance)
        }
    }
}
