import SomaCore
import SwiftUI

struct StrongestEffectRow: View {
    let effect: StrongestEffectPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                HStack(spacing: 6) {
                    Text(effect.predictor)
                    Image(systemName: "arrow.right")
                        .accessibilityHidden(true)
                    Text(effect.outcome)
                }
                .font(.headline)
                Spacer()
                Label(effect.effect.formatted(.number.precision(.fractionLength(2))), systemImage: icon)
                    .font(.body.monospacedDigit())
                    .foregroundStyle(color)
            }
            HStack(spacing: 12) {
                Text("n=\(effect.sampleSize)")
                Text(effect.lagLabel)
                Text(effect.periodLabel)
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(SomaTheme.secondary)
            if let range = effect.confidenceRange {
                Text("Intervalle \(range.lowerBound.formatted(.number.precision(.fractionLength(2)))) à \(range.upperBound.formatted(.number.precision(.fractionLength(2))))")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(SomaTheme.secondary)
            }
            if let qValue = effect.qValue {
                Text("q=\(qValue.formatted(.number.precision(.fractionLength(3))))")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(SomaTheme.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var icon: String {
        switch effect.direction {
        case .favorable: "plus"
        case .unfavorable: "minus"
        case .neutral: "equal"
        }
    }

    private var color: Color {
        switch effect.direction {
        case .favorable: SomaTheme.signal
        case .unfavorable: SomaTheme.warning
        case .neutral: SomaTheme.secondary
        }
    }

    private var accessibilityText: String {
        "Association \(directionLabel) entre \(effect.predictor) et \(effect.outcome), effet \(effect.effect.formatted(.number.precision(.fractionLength(2)))), \(effect.sampleSize) observations, \(effect.lagLabel), \(effect.periodLabel)"
    }

    private var directionLabel: String {
        switch effect.direction {
        case .favorable: "favorable"
        case .unfavorable: "défavorable"
        case .neutral: "neutre"
        }
    }
}
