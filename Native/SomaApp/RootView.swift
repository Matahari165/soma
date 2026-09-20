import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var destination: AppDestination
    @State private var selectedTab: NativePrimaryTab
    @State private var signalsPath: [AppDestination] = []
    @State private var settingsPath: [AppDestination] = []

    init() {
        let arguments = ProcessInfo.processInfo.arguments
        let initialDestination: AppDestination = if arguments.contains("--sleep-preview") {
            .sleep
        } else if arguments.contains("--preview-analysis") {
            .analysis
        } else if arguments.contains("--preview-settings") {
            .settings
        } else if arguments.contains("--health-preview") {
            .health
        } else if arguments.contains("--preview-meals") {
            .meals
        } else if arguments.contains("--effort-preview") {
            .activity
        } else if arguments.contains("--recovery-preview") {
            .recovery
        } else if arguments.contains("--preview-export") {
            .export
        } else {
            .day
        }
        _destination = State(initialValue: initialDestination)
        _selectedTab = State(initialValue: NativePrimaryTab(for: initialDestination))
        if [.health, .export].contains(initialDestination) {
            _settingsPath = State(initialValue: [initialDestination])
        } else if ![.day, .analysis, .settings].contains(initialDestination) {
            _signalsPath = State(initialValue: [initialDestination])
        }
    }

    var body: some View {
        Group {
            if model.isBootstrapping {
                ProgressView("Ouverture de Soma…")
                    .accessibilityLabel("Ouverture de Soma en cours")
            } else if model.isAuthenticated && !model.hasCompletedOnboarding {
                OnboardingView(displayName: model.currentUser?.displayName ?? "") { openHealth in
                    navigate(to: openHealth ? .health : .day)
                }
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
            List(selection: $destination) {
                Section {
                    sidebarRow(.day)
                    sidebarRow(.analysis)
                }
                Section("Signaux") {
                    sidebarRow(.sleep)
                    sidebarRow(.recovery)
                    sidebarRow(.activity)
                    sidebarRow(.meals)
                }
                Section {
                    sidebarRow(.settings)
                }
            }
            .listStyle(.sidebar)
            .navigationTitle("Soma")
            .navigationSplitViewColumnWidth(min: 188, ideal: 208, max: 240)
            .safeAreaInset(edge: .bottom) {
                if model.isPreviewMode {
                    Label("Démo · données fictives · lecture seule", systemImage: "eye")
                        .font(.caption)
                        .foregroundStyle(SomaTheme.secondary)
                        .padding()
                } else {
                    Button("Se déconnecter") { Task { await model.logout() } }
                        .buttonStyle(.plain)
                        .padding()
                }
            }
        } detail: {
            destinationView(for: destination)
                .id(destination)
        }
        #else
        TabView(selection: $selectedTab) {
            NavigationStack { DayView() }
                .tabItem { Label("Jour", systemImage: "calendar") }
                .tag(NativePrimaryTab.day)
            NavigationStack { AnalysisView() }
                .tabItem { Label("Analyse", systemImage: "waveform.path.ecg") }
                .tag(NativePrimaryTab.analysis)
            NavigationStack(path: $signalsPath) {
                List {
                    Section("Signaux") {
                        signalLink(.sleep)
                        signalLink(.recovery)
                        signalLink(.activity)
                        signalLink(.meals)
                    }
                }
                .navigationTitle("Signaux")
                .navigationDestination(for: AppDestination.self) { target in
                    destinationView(for: target)
                }
            }
            .tabItem { Label("Signaux", systemImage: "chart.xyaxis.line") }
            .tag(NativePrimaryTab.signals)
            NavigationStack(path: $settingsPath) {
                SettingsView { navigate(to: $0) }
                    .disabled(model.isPreviewMode)
                    .navigationDestination(for: AppDestination.self) { target in
                        destinationView(for: target)
                    }
            }
                .tabItem { Label("Paramètres", systemImage: "gearshape") }
                .tag(NativePrimaryTab.settings)
        }
        .tint(SomaTheme.primary)
        #endif
    }

    @ViewBuilder
    private func destinationView(for target: AppDestination) -> some View {
        switch target {
        case .day: DayView()
        case .analysis: AnalysisView()
        case .health: HealthView()
        case .meals: MealsOverviewView()
        case .sleep: SleepView()
        case .recovery: RecoveryView()
        case .activity: ActivityView()
        case .export:
            if model.isPreviewMode {
                ContentUnavailableView("Export désactivé en démonstration", systemImage: "square.and.arrow.up", description: Text("Les données affichées sont fictives."))
            } else {
                ExportView()
            }
        case .settings:
            SettingsView { navigate(to: $0) }
                .disabled(model.isPreviewMode)
                .safeAreaInset(edge: .top) {
                    if model.isPreviewMode {
                        Text("Mode démonstration · actions désactivées")
                            .font(.caption)
                            .foregroundStyle(SomaTheme.secondary)
                            .padding(12)
                    }
                }
        }
    }

    private func signalLink(_ target: AppDestination) -> some View {
        NavigationLink(value: target) {
            Label(target.title, systemImage: target.systemImage)
                .frame(minHeight: 44)
        }
    }

    private func sidebarRow(_ target: AppDestination) -> some View {
        Label(target.title, systemImage: target.systemImage)
            .tag(target)
    }

    private func navigate(to target: AppDestination) {
        destination = target
        #if os(iOS)
        selectedTab = NativePrimaryTab(for: target)
        signalsPath = selectedTab == .signals ? [target] : []
        settingsPath = selectedTab == .settings && [.health, .export].contains(target) ? [target] : []
        #endif
    }
}

private enum NativePrimaryTab: Hashable {
    case day, analysis, signals, settings

    init(for destination: AppDestination) {
        switch destination {
        case .day: self = .day
        case .analysis: self = .analysis
        case .health, .export, .settings: self = .settings
        default: self = .signals
        }
    }
}
