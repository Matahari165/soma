import SomaCore
import SwiftUI

struct StrongestEffectsContent: View {
    let effects: [StrongestEffectPresentation]
    let partialNote: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Strongest Effects").font(.title2)
            if effects.isEmpty {
                Label("Pas encore assez de jours comparables", systemImage: "minus.circle")
                    .font(.body)
                    .foregroundStyle(SomaTheme.secondary)
            } else {
                ForEach(effects.filter(\.isEligible)) { effect in
                    StrongestEffectRow(effect: effect)
                    if effect.id != effects.last?.id { Divider().overlay(SomaTheme.rule) }
                }
            }
            if let partialNote {
                Label(partialNote, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.warning)
            }
        }
    }
}
