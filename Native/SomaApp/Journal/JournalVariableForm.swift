import Foundation
import SomaCore

struct JournalVariableForm: Equatable {
    var name = ""
    var variableType: JournalVariableType = .boolean
    var unit = ""
    var options = ""
    var emoji = "🧪"
    var defaultValue = ""
    var dayPeriod: JournalDayPeriod = .day
    var trackingCadence: JournalTrackingCadence = .daily

    init() {}

    init(variable: JournalVariable) {
        name = variable.name
        variableType = variable.variableType
        unit = variable.unit ?? ""
        options = variable.options.joined(separator: ", ")
        emoji = variable.emoji
        defaultValue = JournalValueParser.text(variable.defaultValue)
        dayPeriod = variable.dayPeriod
        trackingCadence = variable.resolvedTrackingCadence
    }

    var parsedOptions: [String] {
        var seen = Set<String>()
        return options.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    var isValid: Bool {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty, cleanName.count <= 80 else { return false }
        if variableType == .category, parsedOptions.count < 2 { return false }
        return defaultValue.isEmpty || defaultJSONValue != nil
    }

    var defaultJSONValue: JSONValue? {
        guard !defaultValue.isEmpty else { return nil }
        let placeholder = JournalVariable(
            id: UUID().uuidString,
            name: name,
            variableType: variableType,
            unit: unit.isEmpty ? nil : unit,
            options: parsedOptions,
            position: 0,
            isActive: true,
            emoji: emoji,
            defaultValue: nil,
            dayPeriod: dayPeriod,
            captureMode: .manual,
            automaticMetricId: nil,
            trackingCadence: trackingCadence
        )
        return JournalValueParser.parse(defaultValue, for: placeholder)
    }

    func createRequest() -> JournalVariableCreateRequest {
        JournalVariableCreateRequest(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            variableType: variableType,
            unit: unit.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            options: parsedOptions,
            emoji: emoji.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "🧪",
            defaultValue: defaultJSONValue,
            dayPeriod: dayPeriod,
            trackingCadence: trackingCadence
        )
    }

    func updateRequest(for variable: JournalVariable) -> JournalVariableDefinitionUpdateRequest {
        JournalVariableDefinitionUpdateRequest(
            id: variable.id,
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            variableType: variableType == variable.variableType ? nil : variableType,
            unit: unit.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            options: variableType == .category ? parsedOptions : nil,
            emoji: emoji.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "🧪",
            defaultValue: defaultJSONValue,
            dayPeriod: dayPeriod,
            trackingCadence: trackingCadence
        )
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
