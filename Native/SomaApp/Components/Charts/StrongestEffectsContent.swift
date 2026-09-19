import SomaCore
import SwiftUI

struct StrongestEffectsContent: View {
    let effects: [StrongestEffectPresentation]
    let partialNote: String?

    var body: some View {
        let eligibleEffects = effects.filter(\.isEligible)
        VStack(alignment: .leading, spacing: 16) {
            Text("Strongest Effects").font(.title2)
            if eligibleEffects.isEmpty {
                Label("Pas encore assez de jours comparables", systemImage: "minus.circle")
                    .font(.body)
                    .foregroundStyle(SomaTheme.secondary)
            } else {
                ForEach(eligibleEffects) { effect in
                    StrongestEffectRow(effect: effect)
                    if effect.id != eligibleEffects.last?.id { Divider().overlay(SomaTheme.rule) }
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
