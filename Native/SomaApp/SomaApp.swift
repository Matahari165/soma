import SwiftUI
import SomaCore

@main
struct SomaApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .task { await model.restoreSession() }
                .onOpenURL { model.handleAuthenticationURL($0) }
        }
        #if os(macOS)
        .defaultSize(width: 1_440, height: 900)
        #endif
    }
}
