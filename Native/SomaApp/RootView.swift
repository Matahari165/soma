import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var destination: AppDestination

    init() {
        let arguments = ProcessInfo.processInfo.arguments
        let initialDestination: AppDestination = if arguments.contains("--preview-settings") {
            .settings
        } else if arguments.contains("--health-preview") {
            .health
        } else if arguments.contains("--preview-export") {
            .export
        } else {
            .day
        }
        _destination = State(initialValue: initialDestination)
    }

    var body: some View {
        Group {
            if model.isBootstrapping {
                ProgressView("Ouverture de Soma…")
                    .accessibilityLabel("Ouverture de Soma en cours")
            } else if model.isAuthenticated {
                authenticatedContent
            } else {
                LoginView()
            }
        }
        .somaScreen()
        .safeAreaInset(edge: .top, spacing: 0) {
            if let message = model.errorMessage {
                Text(message)
                    .font(.callout)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(SomaTheme.rule)
                    .accessibilityLabel("Erreur : \(message)")
                    .accessibilityAddTraits(.isStaticText)
            }
        }
    }

    @ViewBuilder
    private var authenticatedContent: some View {
        #if os(macOS)
        NavigationSplitView {
            List(AppDestination.allCases, selection: $destination) { destination in
                Label(destination.title, systemImage: destination.systemImage)
                    .tag(destination)
            }
            .navigationTitle("Soma")
            .navigationSplitViewColumnWidth(min: 188, ideal: 208, max: 240)
            .safeAreaInset(edge: .bottom) {
                Button("Se déconnecter") { Task { await model.logout() } }
                    .buttonStyle(.plain)
                    .padding()
            }
        } detail: {
            destinationView(for: destination)
                .id(destination)
        }
        #else
        TabView(selection: $destination) {
            ForEach(AppDestination.allCases) { tab in
                NavigationStack {
                    destinationView(for: tab)
                }
                .tabItem {
                    Label(tab.title, systemImage: tab.systemImage)
                }
                .tag(tab)
            }
        }
        .tint(SomaTheme.primary)
        #endif
    }

    @ViewBuilder
    private func destinationView(for destination: AppDestination) -> some View {
        switch destination {
        case .day: DayView()
        case .analysis: AnalysisView()
        case .health: HealthView()
        case .meals: MealsOverviewView()
        case .sleep: SleepView()
        case .recovery: RecoveryView()
        case .activity: ActivityView()
        case .export: ExportView()
        case .settings: SettingsView()
        }
    }
}
