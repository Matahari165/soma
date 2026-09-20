import SwiftUI

struct SettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(.title2, design: .serif))
                .accessibilityAddTraits(.isHeader)
            content
        }
    }
}
