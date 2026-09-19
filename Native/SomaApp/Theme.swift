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

struct SomaPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.medium))
            .foregroundStyle(SomaTheme.canvas)
            .frame(minHeight: 44)
            .padding(.horizontal, 16)
            .background(SomaTheme.primary.opacity(configuration.isPressed ? 0.82 : 1))
            .clipShape(.rect(cornerRadius: 4))
            .opacity(isEnabled ? 1 : 0.48)
            .contentShape(.rect)
    }
}

extension View {
    func somaScreen() -> some View { modifier(SomaScreen()) }
}
