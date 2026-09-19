import SomaCore
import SwiftUI

struct ChartProvenanceLabel: View {
    let provenance: DataProvenance

    var body: some View {
        Label(provenance.label, systemImage: icon)
            .font(.caption)
            .foregroundStyle(SomaTheme.secondary)
            .accessibilityLabel(provenance.label)
    }

    private var icon: String {
        switch provenance {
        case .healthSource: "heart.text.clipboard"
        case .somaCalculation: "function"
        }
    }
}
