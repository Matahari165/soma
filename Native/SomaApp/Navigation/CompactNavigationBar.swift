import SwiftUI

struct CompactNavigationBar: View {
    @Binding var selection: AppDestination

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 4)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 4) {
            ForEach(AppDestination.allCases) { destination in
                Button {
                    selection = destination
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: destination.systemImage)
                            .font(.system(size: 15, weight: .medium))
                        Text(destination.title)
                            .font(.caption2)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .foregroundStyle(selection == destination ? SomaTheme.primary : SomaTheme.secondary)
                    .background(selection == destination ? SomaTheme.rule : .clear)
                    .clipShape(.rect(cornerRadius: 4))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(destination.title)
                .accessibilityAddTraits(selection == destination ? .isSelected : [])
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(SomaTheme.canvas)
        .overlay(alignment: .top) { Divider().overlay(SomaTheme.rule) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Navigation principale")
    }
}
