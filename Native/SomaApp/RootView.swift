import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var destination: AppDestination = .day

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
        .overlay(alignment: .bottom) {
            if let message = model.errorMessage {
                Text(message)
                    .font(.callout)
                    .padding(12)
                    .background(SomaTheme.rule)
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
            destinationView
                .id(destination)
        }
        #else
        NavigationStack {
            destinationView
                .id(destination)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            CompactNavigationBar(selection: $destination)
        }
        #endif
    }

    @ViewBuilder
    private var destinationView: some View {
        switch destination {
        case .day: DayView()
        case .analysis: AnalysisView()
        case .meals: MealsOverviewView()
        case .sleep: SleepView()
        case .recovery: RecoveryView()
        case .activity: ActivityView()
        case .export: ExportView()
        case .settings: SettingsView()
        }
    }
}
