import SwiftUI

struct ScreenScaffold<Content: View>: View {
    let title: String
    let context: String?
    @ViewBuilder let content: Content

    init(title: String, context: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.context = context
        self.content = content()
    }

    private var contentView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title)
                        .font(.system(.largeTitle, design: .serif, weight: .regular))
                        .accessibilityAddTraits(.isHeader)
                    if let context {
                        Text(context)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(SomaTheme.secondary)
                    }
                }
                content
            }
            .padding(24)
            .frame(maxWidth: 920, alignment: .leading)
        }
    }

    var body: some View {
        #if os(macOS)
        contentView
        .navigationTitle(title)
        #else
        contentView
            .toolbar(.hidden, for: .navigationBar)
        #endif
    }
}
