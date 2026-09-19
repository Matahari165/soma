import SwiftUI
import SomaCore

struct SettingsValueRow: View {
    let label: String
    let value: String

    var body: some View {
        ViewThatFits(in: .horizontal) {
            LabeledContent(label) { valueText.multilineTextAlignment(.trailing) }
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                valueText
            }
        }
        .frame(minHeight: 48)
        .accessibilityElement(children: .combine)
    }

    private var valueText: some View {
        Text(value)
            .font(.system(.body, design: .monospaced))
            .foregroundStyle(SomaTheme.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct SettingsStatusRow: View {
    let title: String
    let detail: String
    let symbol: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol).frame(width: 24).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                Text(detail).font(.callout).foregroundStyle(SomaTheme.secondary)
            }
            Spacer(minLength: 8)
        }
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
    }
}

struct SettingsActionRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let title: String
    let detail: String
    let symbol: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    label
                    Button(actionTitle, action: action).frame(minHeight: 44)
                }
            } else {
                HStack(alignment: .center, spacing: 12) {
                    label
                    Spacer(minLength: 8)
                    Button(actionTitle, action: action).frame(minHeight: 44)
                }
            }
        }
        .frame(minHeight: 60)
    }

    private var label: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol).frame(width: 24).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                Text(detail).font(.callout).foregroundStyle(SomaTheme.secondary)
            }
        }
    }
}

struct SessionRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let session: DeviceSession
    let isCurrent: Bool
    let isRevoking: Bool
    let revoke: () -> Void

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    sessionLabel
                    if !isCurrent { revokeButton }
                }
            } else {
                HStack(alignment: .center, spacing: 12) {
                    sessionLabel
                    Spacer(minLength: 8)
                    if !isCurrent { revokeButton }
                }
            }
        }
        .padding(.vertical, 4)
        .frame(minHeight: 60)
        .accessibilityElement(children: .contain)
    }

    private var sessionLabel: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: iconName).frame(width: 24).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(session.deviceName).fixedSize(horizontal: false, vertical: true)
                if isCurrent { Text("Cet appareil").font(.caption).foregroundStyle(SomaTheme.signal) }
                Text("Connecté le \(session.createdAt.formatted(date: .abbreviated, time: .shortened)) · expire le \(session.expiresAt.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var revokeButton: some View {
        Button(isRevoking ? "Déconnexion…" : "Déconnecter", role: .destructive, action: revoke)
            .disabled(isRevoking)
            .accessibilityLabel("Déconnecter \(session.deviceName)")
            .accessibilityValue(isRevoking ? "En cours" : "")
            .frame(minHeight: 44)
    }

    private var iconName: String {
        switch session.platform {
        case .ios: "iphone"
        case .macos: "desktopcomputer"
        case .web: "globe"
        }
    }
}
