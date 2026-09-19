import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if model.isBootstrapping { ProgressView("Ouverture de Soma…") }
            else if model.isAuthenticated { authenticatedContent }
            else { LoginView() }
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
        @Bindable var model = model
        NavigationSplitView {
            List(AppModel.Destination.allCases, selection: $model.destination) { destination in
                Text(destination.rawValue).tag(destination)
            }
            .navigationTitle("Soma")
            .safeAreaInset(edge: .bottom) {
                Button("Se déconnecter") { Task { await model.logout() } }
                    .buttonStyle(.plain)
                    .padding()
            }
        } detail: { destinationView }
        #else
        TabView(selection: Bindable(model).destination) {
            Tab("Jour", systemImage: "calendar", value: AppModel.Destination.day) {
                DayView()
            }
            Tab("Effets", systemImage: "waveform.path.ecg", value: AppModel.Destination.analysis) {
                AnalysisView()
            }
            Tab("Santé", systemImage: "heart.text.square", value: AppModel.Destination.health) {
                HealthView()
            }
            Tab("Export", systemImage: "square.and.arrow.up", value: AppModel.Destination.export) {
                ExportView()
            }
        }
        .tint(SomaTheme.primary)
        #endif
    }

    @ViewBuilder
    private var destinationView: some View {
        switch model.destination {
        case .day: DayView()
        case .analysis: AnalysisView()
        case .health: HealthView()
        case .export: ExportView()
        }
    }
}
