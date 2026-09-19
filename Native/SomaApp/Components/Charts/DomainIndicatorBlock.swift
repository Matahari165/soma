import SomaCore
import SwiftUI

struct DomainIndicatorBlock: View {
    let data: DataAvailability<DomainIndicatorPresentation>

    var body: some View {
        switch data {
        case .unavailable(let reason):
            ChartUnavailableView(title: "Indicateur", reason: reason)
        case .available(let presentation):
            DomainIndicatorContent(presentation: presentation, partialNote: nil)
        case .partial(let presentation, let note):
            DomainIndicatorContent(presentation: presentation, partialNote: note)
        }
    }
}
