import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScreenScaffold(title: "Paramètres") {
            VStack(alignment: .leading, spacing: 0) {
                settingsRow(label: "Session", value: model.isAuthenticated ? "Connectée" : "Indisponible")
                Divider().overlay(SomaTheme.rule)
                settingsRow(label: "Date active", value: model.activeDate.rawValue)
                Divider().overlay(SomaTheme.rule)
            }

            Button("Se déconnecter", role: .destructive) {
                Task { await model.logout() }
            }
            .frame(minHeight: 44)
        }
    }

    private func settingsRow(label: String, value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
            Spacer()
            Text(value)
                .font(.system(.callout, design: .monospaced))
                .foregroundStyle(SomaTheme.secondary)
                .multilineTextAlignment(.trailing)
        }
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
    }
}
