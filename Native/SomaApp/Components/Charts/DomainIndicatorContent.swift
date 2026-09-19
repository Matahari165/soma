import SomaCore
import SwiftUI

struct DomainIndicatorContent: View {
    let presentation: DomainIndicatorPresentation
    let partialNote: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(presentation.title).font(.headline)
                Spacer()
                Text(presentation.scoreLabel).font(.title2.monospacedDigit())
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Rectangle().fill(SomaTheme.rule)
                    Rectangle()
                        .fill(SomaTheme.primary)
                        .frame(width: proxy.size.width * clampedScore)
                }
            }
            .frame(height: 4)
            .accessibilityHidden(true)
            HStack {
                Text(presentation.detail).font(.body)
                Spacer()
                Text("Couverture \((presentation.coverage * 100).formatted(.number.precision(.fractionLength(0)))) %")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(SomaTheme.secondary)
            }
            if let partialNote {
                Label(partialNote, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.warning)
            }
            ForEach(presentation.components) { component in
                LabeledContent(component.label) {
                    Text(component.rawValueLabel ?? "Indisponible")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(component.rawValueLabel == nil ? SomaTheme.secondary : SomaTheme.primary)
                }
                .accessibilityLabel("\(component.label), \(component.rawValueLabel ?? "indisponible"), poids \((component.weight * 100).formatted(.number.precision(.fractionLength(0)))) pour cent")
            }
            ChartProvenanceLabel(provenance: presentation.provenance)
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue("\(presentation.scoreLabel), couverture \((presentation.coverage * 100).formatted(.number.precision(.fractionLength(0)))) pour cent")
    }

    private var clampedScore: Double { min(max(presentation.score, 0), 100) / 100 }
}
