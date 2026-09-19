import SomaCore
import SwiftUI

struct MetricTrendBlock: View {
    let data: DataAvailability<MetricTrendPresentation>

    var body: some View {
        switch data {
        case .unavailable(let reason):
            ChartUnavailableView(title: "Tendance", reason: reason)
        case .available(let presentation):
            MetricTrendContent(presentation: presentation, partialNote: nil)
        case .partial(let presentation, let note):
            MetricTrendContent(presentation: presentation, partialNote: note)
        }
    }
}
