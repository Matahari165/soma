import SomaCore
import SwiftUI

struct StrongestEffectsBlock: View {
    let data: DataAvailability<[StrongestEffectPresentation]>

    var body: some View {
        switch data {
        case .unavailable(let reason):
            ChartUnavailableView(title: "Strongest Effects", reason: reason)
        case .available(let effects):
            StrongestEffectsContent(effects: effects, partialNote: nil)
        case .partial(let effects, let note):
            StrongestEffectsContent(effects: effects, partialNote: note)
        }
    }
}
