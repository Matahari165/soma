import SwiftUI

struct ContentStateView: View {
    enum Kind {
        case loading(String)
        case empty(title: String, detail: String)
        case error(message: String, retry: (() -> Void)?)
    }

    let kind: Kind

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch kind {
            case .loading(let message):
                ProgressView(message)
                    .accessibilityLabel(message)
            case .empty(let title, let detail):
                Text(title).font(.headline)
                Text(detail).foregroundStyle(SomaTheme.secondary)
            case .error(let message, let retry):
                Text("Chargement impossible").font(.headline)
                Text(message).foregroundStyle(SomaTheme.secondary)
                if let retry {
                    Button("Réessayer", action: retry)
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                }
            }
        }
        .frame(maxWidth: 560, minHeight: 120, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}
