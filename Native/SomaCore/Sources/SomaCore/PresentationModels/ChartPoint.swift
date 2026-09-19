import Foundation

public struct ChartPoint: Identifiable, Equatable, Sendable {
    public let id: String
    public let date: Date
    public let value: Double?
    public let label: String

    public init(id: String, date: Date, value: Double?, label: String) {
        self.id = id
        self.date = date
        self.value = value
        self.label = label
    }
}
