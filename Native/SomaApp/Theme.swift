import SwiftUI

enum SomaTheme {
    static let canvas = Color(red: 0.02, green: 0.02, blue: 0.02)
    static let primary = Color(red: 0.945, green: 0.945, blue: 0.945)
    static let secondary = Color(red: 0.667, green: 0.667, blue: 0.667)
    static let rule = Color(red: 0.16, green: 0.16, blue: 0.16)
    static let warning = Color(red: 0.835, green: 0.765, blue: 0.592)
    static let signal = Color(red: 0.835, green: 0.898, blue: 0.855)
}

struct SomaScreen: ViewModifier {
    func body(content: Content) -> some View {
        content
            .foregroundStyle(SomaTheme.primary)
            .background(SomaTheme.canvas.ignoresSafeArea())
    }
}

extension View {
    func somaScreen() -> some View { modifier(SomaScreen()) }
}
