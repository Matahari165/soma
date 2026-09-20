import SwiftUI
import SomaCore

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var sessionToRevoke: DeviceSession?
    @State private var showsAccountDeletion = false
    #if os(macOS)
    @Environment(VisualBreakController.self) private var visualBreaks
    @AppStorage("visualBreak.showMenuBarIcon") private var showMenuBarIcon = true
    #endif

    let navigate: (AppDestination) -> Void

    var body: some View {
        ScreenScaffold(title: "Paramètres") {
            accountSection
            #if os(macOS)
            visualBreakSection
            #endif
            SettingsSection(title: "Sessions et appareils") { sessionsContent }
            healthSourcesSection
            dataSection
            legalSection
            sessionActionsSection
            dangerSection
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
            Text("Cette session devra se reconnecter. Les données déjà enregistrées dans Soma restent intactes.")
        }
        .sheet(isPresented: $showsAccountDeletion) {
            AccountDeletionView()
                .environment(model)
        }
    }

    #if os(macOS)
    private var visualBreakSection: some View {
        @Bindable var breaks = visualBreaks
        return SettingsSection(title: "Pauses visuelles") {
            Toggle("Activer les pauses", isOn: $breaks.enabled)
            Picker("Toutes les", selection: $breaks.intervalMinutes) {
                ForEach(1...120, id: \.self) { Text("\($0) min").tag($0) }
            }
            .disabled(!visualBreaks.enabled)
            Picker("Durée", selection: $breaks.durationSeconds) {
                ForEach(stride(from: 5, through: 120, by: 5).map { $0 }, id: \.self) {
                    Text("\($0) s").tag($0)
                }
            }
            .disabled(!visualBreaks.enabled)
            Toggle("Sur tous les écrans", isOn: $breaks.allDisplays)
                .disabled(!visualBreaks.enabled)
            Toggle("Icône dans la barre des menus", isOn: $showMenuBarIcon)
            Button("Tester la pause") { visualBreaks.test() }
                .frame(minHeight: 44)
        }
    }
    #endif

    private var accountSection: some View {
        SettingsSection(title: "Compte") {
            SettingsValueRow(label: "Nom", value: model.currentUser?.displayName ?? "Indisponible")
            SettingsValueRow(label: "Adresse email", value: model.currentUser?.email ?? "Indisponible")
            SettingsValueRow(label: "Session", value: model.isAuthenticated ? "Connectée" : "Indisponible")
        }
    }

    private var healthSourcesSection: some View {
        SettingsSection(title: "Sources de santé") {
            #if os(iOS)
            SettingsActionRow(
                title: "Santé Apple",
                detail: "Disponible sur cet iPhone · état d’autorisation à vérifier",
                symbol: "heart.text.square",
                actionTitle: "Vérifier"
            ) { navigate(.health) }
            #else
            SettingsActionRow(
                title: "Santé Apple",
                detail: "Accès aux données Santé disponible dans l’app iPhone",
                symbol: "heart.text.square",
                actionTitle: "Ouvrir"
            ) { navigate(.health) }
            #endif
            SettingsStatusRow(
                title: "Google Health",
                detail: "Configuration et état disponibles sur le site Soma",
                symbol: "globe"
            )
            Link(destination: Self.webSettingsURL) {
                Label("Ouvrir les réglages web", systemImage: "arrow.up.right.square")
            }
            .frame(minHeight: 44)
            .accessibilityHint("Ouvre le site sécurisé de Soma dans le navigateur")
            Text("Déconnecter une source arrête les futurs imports. L’historique déjà importé n’est jamais supprimé automatiquement.")
                .font(.callout)
                .foregroundStyle(SomaTheme.secondary)
        }
    }

    private var dataSection: some View {
        SettingsSection(title: "Données") {
            SettingsActionRow(
                title: "Exporter mes données",
                detail: "Créer une copie JSON et télécharger les archives disponibles",
                symbol: "square.and.arrow.up",
                actionTitle: "Ouvrir"
            ) { navigate(.export) }
        }
    }

    private var legalSection: some View {
        SettingsSection(title: "Informations légales") {
            Link("Confidentialité", destination: Self.privacyURL)
                .frame(minHeight: 44, alignment: .leading)
            Divider().overlay(SomaTheme.rule)
            Link("Conditions d’utilisation", destination: Self.termsURL)
                .frame(minHeight: 44, alignment: .leading)
        }
    }

    private var sessionActionsSection: some View {
        SettingsSection(title: "Connexion") {
            Button("Se déconnecter de cet appareil", role: .destructive) {
                Task { await model.logout() }
            }
            .disabled(model.isLoading)
            .frame(minHeight: 44)
            Text("Seule cette session est fermée. Les autres appareils et les données enregistrées restent disponibles.")
                .font(.callout)
                .foregroundStyle(SomaTheme.secondary)
        }
    }

    private var dangerSection: some View {
        SettingsSection(title: "Zone sensible") {
            Text("La suppression efface définitivement le compte, le journal, les repas, les analyses, les sessions et les fichiers de santé stockés par Soma. Cette action ne peut pas être annulée.")
                .foregroundStyle(SomaTheme.secondary)
            Button("Supprimer définitivement le compte", role: .destructive) {
                showsAccountDeletion = true
            }
            .frame(minHeight: 44)
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
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(SomaTheme.warning)
                Button("Réessayer") { Task { await model.refreshSessions() } }
                    .frame(minHeight: 44)
            }
        } else if model.deviceSessions.isEmpty {
            ContentUnavailableView(
                "Aucun appareil actif",
                systemImage: "rectangle.connected.to.line.below",
                description: Text("Les sessions apparaîtront ici après une connexion.")
            )
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(sortedSessions.enumerated()), id: \.element.id) { index, session in
                    if index > 0 { Divider().overlay(SomaTheme.rule) }
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
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(SomaTheme.warning)
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

    private static let webSettingsURL = URL(string: "https://soma-neon-phi.vercel.app/settings")!
    private static let privacyURL = URL(string: "https://soma-neon-phi.vercel.app/privacy")!
    private static let termsURL = URL(string: "https://soma-neon-phi.vercel.app/terms")!
}
