import Foundation

enum SleepFormatting {
    static func duration(_ minutes: Double?) -> String {
        guard let minutes else { return "—" }
        let rounded = Int(minutes.rounded())
        return "\(rounded / 60) h \(rounded % 60) min"
    }

    static func percent(_ value: Double?) -> String {
        value.map { "\(Int($0.rounded())) %" } ?? "—"
    }

    static func score(_ value: Double?) -> String {
        value.map { "\(Int($0.rounded())) / 100" } ?? "—"
    }

    static func instant(_ value: String?) -> Date? {
        guard let value else { return nil }
        return try? Date(value, strategy: .iso8601)
    }

    static func time(_ value: String?, timeZone: String) -> String? {
        guard let date = instant(value) else { return nil }
        var style = Date.FormatStyle(date: .omitted, time: .shortened)
        style.timeZone = zone(timeZone)
        return date.formatted(style)
    }

    static func dateTime(_ value: String?, timeZone: String) -> String? {
        guard let date = instant(value) else { return nil }
        var style = Date.FormatStyle(date: .abbreviated, time: .shortened)
        style.timeZone = zone(timeZone)
        return date.formatted(style)
    }

    static func day(_ value: String) -> Date {
        (try? Date(value, strategy: .iso8601.year().month().day())) ?? .distantPast
    }

    static func date(_ value: String) -> String {
        day(value).formatted(date: .abbreviated, time: .omitted)
    }

    private static func zone(_ identifier: String) -> TimeZone {
        TimeZone(identifier: identifier) ?? .current
    }
}
