import SwiftUI

enum SomaTheme {
    static func bodyFont(_ size: CGFloat = 15) -> Font {
        .custom("SchibstedGrotesk-Regular", size: size, relativeTo: .body)
    }

    static func numberFont(_ size: CGFloat = 15) -> Font {
        .custom("AzeretMonoRoman-Regular", size: size, relativeTo: .body)
    }
    static let canvas = Color(red: 5.0 / 255, green: 5.0 / 255, blue: 5.0 / 255)
    static let surface = Color(red: 8.0 / 255, green: 8.0 / 255, blue: 8.0 / 255)
    static let primary = Color(red: 0.945, green: 0.945, blue: 0.945)
    static let secondary = Color(red: 0.667, green: 0.667, blue: 0.667)
    static let rule = Color(red: 41.0 / 255, green: 41.0 / 255, blue: 41.0 / 255)
    static let warning = Color(red: 0.835, green: 0.765, blue: 0.592)
    static let signal = Color(red: 0.835, green: 0.898, blue: 0.855)
    static let error = Color(red: 226.0 / 255, green: 178.0 / 255, blue: 170.0 / 255)
    static let information = Color(red: 173.0 / 255, green: 197.0 / 255, blue: 223.0 / 255)
}

struct SomaScreen: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(SomaTheme.bodyFont())
            .foregroundStyle(SomaTheme.primary)
            .background(SomaTheme.canvas.ignoresSafeArea())
    }
}

struct SomaPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.custom("SchibstedGrotesk-Medium", size: 15, relativeTo: .body))
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
