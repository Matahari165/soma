import Foundation

public struct LocalDate: Codable, Hashable, Sendable, CustomStringConvertible {
    public let rawValue: String

    public init(_ rawValue: String) throws {
        guard rawValue.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
              Self.formatter.date(from: rawValue) != nil else {
            throw LocalDateError.invalid
        }
        self.rawValue = rawValue
    }

    public var description: String { rawValue }

    public func adding(days: Int) throws -> LocalDate {
        guard let date = Self.formatter.date(from: rawValue),
              let shifted = Calendar(identifier: .iso8601).date(byAdding: .day, value: days, to: date) else {
            throw LocalDateError.invalid
        }
        return try LocalDate(Self.formatter.string(from: shifted))
    }

    public static func today(timeZone: TimeZone = .current) throws -> LocalDate {
        let formatter = formatter
        formatter.timeZone = timeZone
        return try LocalDate(formatter.string(from: Date()))
    }

    private static var formatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .iso8601)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }
}

public enum LocalDateError: Error, Sendable { case invalid }
