import SwiftUI

struct ChartUnavailableView: View {
    let title: String
    let reason: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            Label(reason, systemImage: "minus.circle")
                .font(.body)
                .foregroundStyle(SomaTheme.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
