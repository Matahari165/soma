import SomaCore
import SwiftUI

struct MetricTrendContent: View {
    let presentation: MetricTrendPresentation
    let partialNote: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(presentation.title).font(.headline)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(presentation.value.formatted()).font(.title2.monospacedDigit())
                Text(presentation.unit).font(.body.monospacedDigit()).foregroundStyle(SomaTheme.secondary)
                Spacer()
                Label(presentation.comparison, systemImage: icon)
                    .font(.body)
                    .foregroundStyle(color)
            }
            if let partialNote {
                Text(partialNote).font(.caption).foregroundStyle(SomaTheme.warning)
            }
            ChartProvenanceLabel(provenance: presentation.provenance)
        }
        .accessibilityElement(children: .combine)
    }

    private var icon: String {
        switch presentation.direction {
        case .improving: "arrow.up.right"
        case .stable: "arrow.right"
        case .declining: "arrow.down.right"
        }
    }

    private var color: Color {
        switch presentation.direction {
        case .improving: SomaTheme.signal
        case .stable: SomaTheme.secondary
        case .declining: SomaTheme.warning
        }
    }
}
