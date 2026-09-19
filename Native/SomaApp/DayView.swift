import SwiftUI
import SomaCore

struct DayView: View {
    @Environment(AppModel.self) private var model
    @State private var journalDraft: [String: String] = [:]
    @State private var mealEditor: MealEditorTarget?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                dateHeader
                journal
                meals
            }
            .padding(24)
            .frame(maxWidth: 920, alignment: .leading)
        }
        .navigationTitle("Jour")
        .task(id: model.day?.date) { loadDraft() }
        .sheet(item: $mealEditor) { target in
            MealEditorView(mealType: target.type)
        }
    }

    private var dateHeader: some View {
        HStack {
            Button("Jour précédent", systemImage: "chevron.left") { Task { await model.shiftDate(by: -1) } }.labelStyle(.iconOnly)
            Text(model.activeDate.rawValue).font(.system(.title2, design: .monospaced)).accessibilityLabel("Date active, \(model.activeDate.rawValue)")
            Button("Jour suivant", systemImage: "chevron.right") { Task { await model.shiftDate(by: 1) } }.labelStyle(.iconOnly)
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
    }

    private var journal: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Journal").font(.system(.title2, design: .serif))
            if let day = model.day {
                ForEach(day.variables.filter(\.isActive)) { variable in
                    let entry = day.entries.first { $0.variableId == variable.id }
                    Group {
                        if variable.captureMode == "automatic" {
                            JournalReadOnlyRow(variable: variable, value: entry?.value)
                        } else {
                            JournalEditorRow(variable: variable, value: binding(for: variable.id))
                        }
                    }
                    .padding(.vertical, 8)
                    Divider().overlay(SomaTheme.rule)
                }
                Button("Enregistrer le journal") { Task { await model.saveJournal(values: journalDraft) } }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isLoading)
            } else { Text("Aucune donnée pour cette date.").foregroundStyle(SomaTheme.secondary) }
        }
    }

    private var meals: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Repas").font(.system(.title2, design: .serif))
            if let slots = model.day?.meals {
                ForEach(mealRows(slots), id: \.type) { row in
                    Button {
                        Task {
                            await model.openMeal(row.type)
                            mealEditor = MealEditorTarget(type: row.type)
                        }
                    } label: {
                        HStack {
                        Text(row.label)
                        Spacer()
                        if let meal = row.meal {
                            Text(meal.entryState == "skipped" ? "Ignoré" : meal.status == "confirmed" ? "Confirmé" : "Brouillon")
                                .foregroundStyle(meal.entryState == "skipped" ? SomaTheme.warning : SomaTheme.primary)
                        } else { Text("Absent").foregroundStyle(SomaTheme.secondary) }
                        Image(systemName: "chevron.right").foregroundStyle(SomaTheme.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: 44)
                    .accessibilityLabel("\(row.label), \(row.meal?.entryState == "skipped" ? "ignoré" : row.meal?.status == "confirmed" ? "confirmé" : row.meal == nil ? "absent" : "brouillon")")
                }
            }
        }
    }

    private func mealRows(_ slots: MealSlots) -> [(type: MealType, label: String, meal: MealSummary?)] {
        [
            (.breakfast, "Petit-déjeuner", slots.breakfast),
            (.lunch, "Déjeuner", slots.lunch),
            (.dinner, "Dîner", slots.dinner),
            (.snack, "Collation", slots.snack),
        ]
    }

    private func binding(for id: String) -> Binding<String> {
        Binding(get: { journalDraft[id, default: ""] }, set: { journalDraft[id] = $0 })
    }

    private func loadDraft() {
        guard let day = model.day else { journalDraft = [:]; return }
        journalDraft = Dictionary(uniqueKeysWithValues: day.variables.map { variable in
            let value = day.entries.first { $0.variableId == variable.id }?.value
            let text: String
            switch value {
            case .bool(let value): text = value ? "true" : "false"
            case .number(let value): text = String(value)
            case .string(let value): text = value
            default: text = ""
            }
            return (variable.id, text)
        })
    }
}

private struct MealEditorTarget: Identifiable {
    let type: MealType
    var id: String { type.rawValue }
}

private struct JournalEditorRow: View {
    let variable: JournalVariable
    @Binding var value: String

    var body: some View {
        HStack {
            Text(variable.name)
            Spacer()
            if variable.variableType == "boolean" {
                Picker(variable.name, selection: $value) {
                    Text("—").tag("")
                    Text("Oui").tag("true")
                    Text("Non").tag("false")
                }
                .labelsHidden()
                .frame(maxWidth: 130)
            } else if variable.variableType == "category" {
                Picker(variable.name, selection: $value) {
                    Text("—").tag("")
                    ForEach(variable.options, id: \.self) { Text($0).tag($0) }
                }
                .labelsHidden()
                .frame(maxWidth: 180)
            } else {
                TextField(variable.variableType == "time" ? "23:00" : "—", text: $value)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 150)
                    #if os(iOS)
                    .keyboardType(["number", "count", "duration", "scale"].contains(variable.variableType) ? .decimalPad : .default)
                    #endif
                if let unit = variable.unit { Text(unit).foregroundStyle(SomaTheme.secondary) }
            }
        }
        .accessibilityElement(children: .contain)
    }
}

private struct JournalReadOnlyRow: View {
    let variable: JournalVariable
    let value: JSONValue?

    var body: some View {
        HStack {
            Text(variable.name)
            Spacer()
            switch value {
            case .number(let number): Text(number.formatted())
            case .bool(let bool): Text(bool ? "Oui" : "Non")
            case .string(let string): Text(string)
            default: Text("—").foregroundStyle(SomaTheme.secondary).accessibilityLabel("Non renseigné")
            }
        }
    }
}
