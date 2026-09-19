import SwiftUI
import SomaCore

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var sessionToRevoke: DeviceSession?

    var body: some View {
        ScreenScaffold(title: "Paramètres") {
            VStack(alignment: .leading, spacing: 0) {
                settingsRow(label: "Session", value: model.isAuthenticated ? "Connectée" : "Indisponible")
                Divider().overlay(SomaTheme.rule)
                settingsRow(label: "Date active", value: model.activeDate.rawValue)
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("Appareils connectés")
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                sessionsContent
            }

            VStack(alignment: .leading, spacing: 8) {
                Button("Se déconnecter de cet appareil", role: .destructive) {
                    Task { await model.logout() }
                }
                .disabled(model.isLoading)
                .frame(minHeight: 44)

                Text("Les autres appareils restent connectés.")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.secondary)
            }
        }
        .task { await model.refreshSessions() }
        .refreshable { await model.refreshSessions() }
        .confirmationDialog(
            "Déconnecter \(sessionToRevoke?.deviceName ?? "cet appareil") ?",
            isPresented: Binding(
                get: { sessionToRevoke != nil },
                set: { if !$0 { sessionToRevoke = nil } }
            ),
            titleVisibility: .visible,
            presenting: sessionToRevoke
        ) { session in
            Button("Déconnecter l’appareil", role: .destructive) {
                sessionToRevoke = nil
                Task { await model.revokeSession(session) }
            }
            Button("Annuler", role: .cancel) { sessionToRevoke = nil }
        } message: { _ in
            Text("Cette session devra se reconnecter pour accéder à Soma.")
        }
    }

    @ViewBuilder
    private var sessionsContent: some View {
        if model.isLoadingSessions && model.deviceSessions.isEmpty {
            HStack(spacing: 12) {
                ProgressView()
                Text("Chargement des appareils…")
                    .foregroundStyle(SomaTheme.secondary)
            }
            .frame(minHeight: 52)
            .accessibilityElement(children: .combine)
        } else if let error = model.sessionsErrorMessage, model.deviceSessions.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(error)
                Button("Réessayer") { Task { await model.refreshSessions() } }
                    .frame(minHeight: 44)
            }
        } else if model.deviceSessions.isEmpty {
            Text("Aucun appareil actif.")
                .foregroundStyle(SomaTheme.secondary)
                .frame(minHeight: 52)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(sortedSessions.enumerated()), id: \.element.id) { index, session in
                    if index > 0 {
                        Divider().overlay(SomaTheme.rule)
                    }
                    SessionRow(
                        session: session,
                        isCurrent: session.id == model.currentSession?.id,
                        isRevoking: model.revokingSessionIDs.contains(session.id),
                        revoke: { sessionToRevoke = session }
                    )
                }
            }

            if let error = model.sessionsErrorMessage {
                HStack {
                    Text(error)
                        .foregroundStyle(SomaTheme.warning)
                        .accessibilityAddTraits(.isStaticText)
                    Spacer()
                    Button("Réessayer") { Task { await model.refreshSessions() } }
                        .frame(minHeight: 44)
                }
            }
        }
    }

    private var sortedSessions: [DeviceSession] {
        model.deviceSessions.sorted {
            if $0.id == model.currentSession?.id { return true }
            if $1.id == model.currentSession?.id { return false }
            return $0.createdAt > $1.createdAt
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

private struct SessionRow: View {
    let session: DeviceSession
    let isCurrent: Bool
    let isRevoking: Bool
    let revoke: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: iconName)
                .frame(width: 24)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(session.deviceName)
                        .lineLimit(2)
                    if isCurrent {
                        Text("Cet appareil")
                            .font(.caption)
                            .foregroundStyle(SomaTheme.signal)
                    }
                }
                Text("Connecté le \(session.createdAt.formatted(date: .abbreviated, time: .shortened)) · expire le \(session.expiresAt.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.secondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)

            if !isCurrent {
                Button(isRevoking ? "Déconnexion…" : "Déconnecter", role: .destructive, action: revoke)
                    .disabled(isRevoking)
                    .accessibilityLabel("Déconnecter \(session.deviceName)")
                    .accessibilityValue(isRevoking ? "En cours" : "")
                    .frame(minHeight: 44)
            }
        }
        .padding(.vertical, 4)
        .frame(minHeight: 60)
        .accessibilityElement(children: .contain)
    }

    private var iconName: String {
        switch session.platform {
        case .ios: "iphone"
        case .macos: "desktopcomputer"
        case .web: "globe"
        }
    }
}
