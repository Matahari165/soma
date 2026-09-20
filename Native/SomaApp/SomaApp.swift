import SwiftUI
import SomaCore
#if os(macOS)
import CoreText
#endif

@main
struct SomaApp: App {
    @State private var model = AppModel()

    init() {
        #if os(macOS)
        for name in ["SchibstedGrotesk", "AzeretMono"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "ttf") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .task { await model.restoreSession() }
        }
        #if os(macOS)
        .defaultSize(width: 1_180, height: 760)
        #endif
    }
}
