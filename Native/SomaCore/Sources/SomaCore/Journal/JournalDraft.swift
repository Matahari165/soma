import Foundation

public enum JournalValueState: Equatable, Sendable {
    case missing
    case pending
    case recorded
    case omitted
}

public struct JournalDraft: Equatable, Sendable {
    public private(set) var values: [String: JSONValue]
    public private(set) var states: [String: JournalValueState]

    public init(day: NativeDayResponse) {
        let entries = Dictionary(uniqueKeysWithValues: day.entries.map { ($0.variableId, $0.value) })
        let omitted = Set(day.day?.omittedVariableIds ?? [])
        var nextStates: [String: JournalValueState] = [:]
        var nextValues: [String: JSONValue] = [:]
        for variable in day.variables {
            if omitted.contains(variable.id) {
                nextStates[variable.id] = .omitted
                nextValues[variable.id] = .null
            } else if let entry = entries[variable.id] {
                nextStates[variable.id] = .recorded
                nextValues[variable.id] = entry
            } else {
                nextStates[variable.id] = .missing
                // A default is presentation only. It does not become a journal observation.
                nextValues[variable.id] = variable.resolvedCaptureMode == .manual ? variable.defaultValue ?? .null : .null
            }
        }
        states = nextStates
        values = nextValues
    }

    public mutating func set(_ value: JSONValue, for variableID: String) {
        values[variableID] = value
        states[variableID] = .pending
    }

    public func state(for variableID: String) -> JournalValueState {
        states[variableID] ?? .missing
    }

    public var hasUnsavedChanges: Bool {
        states.values.contains(.pending)
    }

    public func entries(for variables: [JournalVariable], only variableIDs: Set<String>? = nil) -> [JournalSaveEntry] {
        variables
            .filter { variable in
                variable.isActive
                    && variable.resolvedCaptureMode == .manual
                    && (variableIDs?.contains(variable.id) ?? true)
                    && state(for: variable.id) != .missing
            }
            .map { JournalSaveEntry(variableId: $0.id, value: values[$0.id] ?? .null) }
    }

    public func completedCount(for variables: [JournalVariable]) -> Int {
        variables.filter { $0.isActive && [.pending, .recorded].contains(state(for: $0.id)) }.count
    }

    /// Applies a server snapshot while retaining edits made after the request started.
    /// When `acknowledging` is provided, only matching values are considered saved.
    public mutating func mergeServer(_ server: NativeDayResponse, acknowledging entries: [JournalSaveEntry]? = nil) {
        let pending = states.compactMap { variableID, state in state == .pending ? variableID : nil }
        let pendingValues = Dictionary(uniqueKeysWithValues: pending.compactMap { variableID in
            values[variableID].map { (variableID, $0) }
        })
        let acknowledged = Dictionary(uniqueKeysWithValues: (entries ?? []).map { ($0.variableId, $0.value) })
        var next = JournalDraft(day: server)
        for variableID in pending {
            guard let value = pendingValues[variableID] else { continue }
            if let sentValue = acknowledged[variableID], sentValue == value {
                continue
            }
            next.values[variableID] = value
            next.states[variableID] = .pending
        }
        self = next
    }
}

public enum JournalValueParser {
    public static func parse(_ text: String, for variable: JournalVariable) -> JSONValue? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .null }
        switch variable.variableType {
        case .boolean:
            if trimmed == "true" { return .bool(true) }
            if trimmed == "false" { return .bool(false) }
            return nil
        case .category:
            return variable.options.contains(trimmed) ? .string(trimmed) : nil
        case .time:
            if variable.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "dinner end time" {
                let normalized = trimmed.lowercased().replacingOccurrences(of: "h", with: ":").replacingOccurrences(of: ".", with: ":")
                let pieces = normalized.split(separator: ":")
                guard pieces.count == 2, let rawHour = Int(pieces[0]), let minute = Int(pieces[1]), (0...23).contains(rawHour), (0...59).contains(minute) else { return nil }
                let hour = rawHour < 12 ? rawHour + 12 : rawHour
                return .string(String(format: "%02d:%02d", hour, minute))
            }
            guard trimmed.range(of: #"^([01]\d|2[0-3]):[0-5]\d$"#, options: .regularExpression) != nil else { return nil }
            return .string(trimmed)
        case .count:
            guard let value = Double(trimmed), value.isFinite, value >= 0, value <= 1_000_000, value.rounded() == value else { return nil }
            return .number(value)
        case .duration:
            guard let value = Double(trimmed), value.isFinite, value >= 0, value <= 1_000_000 else { return nil }
            return .number(value)
        case .scale:
            guard let value = Double(trimmed), value.isFinite, value.rounded() == value, (1...5).contains(Int(value)) else { return nil }
            return .number(value)
        case .number:
            guard let value = Double(trimmed), value.isFinite, abs(value) <= 1_000_000 else { return nil }
            if ["caffeine", "added sugar", "magnesium"].contains(variable.name.lowercased()), value < 0 { return nil }
            return .number(value)
        }
    }

    public static func text(_ value: JSONValue?) -> String {
        switch value {
        case .bool(let value): value ? "true" : "false"
        case .number(let value): value.formatted(.number.grouping(.never).precision(.fractionLength(0...4)))
        case .string(let value): value
        default: ""
        }
    }
}
