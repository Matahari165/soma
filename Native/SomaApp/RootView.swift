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
            DayView().tabItem { Label("Jour", systemImage: "calendar") }.tag(AppModel.Destination.day)
            AnalysisView().tabItem { Label("Effets", systemImage: "waveform.path.ecg") }.tag(AppModel.Destination.analysis)
            ExportView().tabItem { Label("Export", systemImage: "square.and.arrow.up") }.tag(AppModel.Destination.export)
        }
        #endif
    }

    @ViewBuilder
    private var destinationView: some View {
        switch model.destination {
        case .day: DayView()
        case .analysis: AnalysisView()
        case .export: ExportView()
        }
    }
}
