import Charts
import SomaCore
import SwiftUI

struct SegmentedBarChart: View {
    let data: DataAvailability<SegmentedBarPresentation>

    var body: some View {
        switch data {
        case .unavailable(let reason):
            ChartUnavailableView(title: "Repartition", reason: reason)
        case .available(let presentation):
            SegmentedBarChartContent(presentation: presentation, partialNote: nil)
        case .partial(let presentation, let note):
            SegmentedBarChartContent(presentation: presentation, partialNote: note)
        }
    }
}
