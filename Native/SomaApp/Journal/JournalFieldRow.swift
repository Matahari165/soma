import SwiftUI
import SomaCore

struct JournalFieldRow: View {
    let variable: JournalVariable
    let value: JSONValue
    let state: JournalValueState
    let onChange: (JSONValue) -> Void

    @State private var text = ""
    @State private var hasInvalidText = false
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text(variable.name)
                HStack(spacing: 6) {
                    statusLabel
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 16)
            if variable.resolvedCaptureMode == .automatic {
                readOnlyValue
            } else {
                editor
            }
        }
        .padding(.vertical, 8)
        .frame(minHeight: 56)
        .task(id: value) {
            guard !isFocused else { return }
            text = JournalValueParser.text(value)
            hasInvalidText = false
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var statusLabel: some View {
        if variable.resolvedCaptureMode == .automatic {
            Label("Automatique", systemImage: "waveform.path.ecg")
        } else {
            switch state {
            case .missing:
                Text("Absent")
            case .pending:
                Label("À enregistrer", systemImage: "clock")
            case .recorded:
                Label("Enregistré", systemImage: "checkmark")
            case .omitted:
                Label("Ignoré", systemImage: "minus.circle")
            }
        }
    }

    private var readOnlyValue: some View {
        Text(displayValue)
            .font(.body.monospacedDigit())
            .foregroundStyle(value == .null ? .secondary : .primary)
            .frame(minHeight: 44)
            .accessibilityLabel(variable.name)
            .accessibilityValue(value == .null ? "Non disponible" : displayValue)
    }

    @ViewBuilder
    private var editor: some View {
        switch variable.variableType {
            case .boolean:
                choiceMenu(options: [("Non renseigné", .null), ("Oui", .bool(true)), ("Non", .bool(false))])
            case .category:
                choiceMenu(options: [("Non renseigné", .null)] + variable.options.map { ($0, .string($0)) })
            case .scale:
                choiceMenu(options: [("Non renseigné", .null)] + (1...5).map { (String($0), .number(Double($0))) })
            case .number, .count, .duration, .time:
                HStack(spacing: 8) {
                    TextField(variable.variableType == .time ? "HH:MM" : "—", text: $text)
                        .multilineTextAlignment(.trailing)
                        .font(.body.monospacedDigit())
                        .focused($isFocused)
                        .frame(minWidth: 72, idealWidth: 104, maxWidth: 140)
                        .textFieldStyle(.roundedBorder)
                        .submitLabel(.done)
                        .onSubmit(commitText)
                        .onChange(of: text) { _, _ in commitText() }
                        .accessibilityLabel(variable.name)
                        .accessibilityHint(hasInvalidText ? "Valeur invalide, elle n’est pas enregistrée" : "Enregistrement automatique")
                        #if os(iOS)
                        .keyboardType(variable.variableType == .time ? .numbersAndPunctuation : .decimalPad)
                        #endif
                    if let unit = variable.unit, !unit.isEmpty {
                        Text(unit).foregroundStyle(.secondary)
                    }
                }
        }
    }

    private var displayValue: String {
        switch value {
        case .bool(let bool): bool ? "Oui" : "Non"
        case .number(let number): number.formatted(.number.precision(.fractionLength(0...2))) + (variable.unit.map { " \($0)" } ?? "")
        case .string(let string): string
        default: "—"
        }
    }

    private func choiceMenu(options: [(String, JSONValue)]) -> some View {
        Menu {
            ForEach(options, id: \.0) { option in
                Button(option.0) { onChange(option.1) }
            }
        } label: {
            HStack(spacing: 6) {
                Text(displayValue)
                    .font(.body.monospacedDigit())
                    .foregroundStyle(value == .null ? .secondary : .primary)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(minHeight: 44)
        }
        .accessibilityLabel(variable.name)
        .accessibilityValue(value == .null ? "Non renseigné" : displayValue)
    }

    private func commitText() {
        guard let parsed = JournalValueParser.parse(text, for: variable) else {
            hasInvalidText = true
            return
        }
        hasInvalidText = false
        if parsed != value { onChange(parsed) }
    }
}
