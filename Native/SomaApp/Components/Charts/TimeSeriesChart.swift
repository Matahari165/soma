import Charts
import SomaCore
import SwiftUI

struct TimeSeriesChart: View {
    let data: DataAvailability<TimeSeriesPresentation>

    var body: some View {
        switch data {
        case .unavailable(let reason):
            ChartUnavailableView(title: "Tendance", reason: reason)
        case .available(let presentation):
            TimeSeriesChartContent(presentation: presentation, partialNote: nil)
        case .partial(let presentation, let note):
            TimeSeriesChartContent(presentation: presentation, partialNote: note)
        }
    }
}
