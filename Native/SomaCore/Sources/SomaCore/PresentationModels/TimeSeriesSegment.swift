public struct TimeSeriesSegment: Identifiable, Equatable, Sendable {
    public let id: String
    public let points: [ChartPoint]

    public init(id: String, points: [ChartPoint]) {
        self.id = id
        self.points = points
    }
}
