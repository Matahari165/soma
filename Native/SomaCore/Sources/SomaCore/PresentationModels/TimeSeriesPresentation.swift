public enum ChartLineStyle: Equatable, Sendable { case solid, dashed }

public struct TimeSeries: Identifiable, Equatable, Sendable {
    public let id: String
    public let label: String
    public let points: [ChartPoint]
    public let lineStyle: ChartLineStyle
    public let provenance: DataProvenance

    public init(id: String, label: String, points: [ChartPoint], lineStyle: ChartLineStyle = .solid, provenance: DataProvenance) {
        self.id = id
        self.label = label
        self.points = points
        self.lineStyle = lineStyle
        self.provenance = provenance
    }

    public var measuredSegments: [TimeSeriesSegment] {
        var segments: [TimeSeriesSegment] = []
        var current: [ChartPoint] = []

        for point in points {
            if point.value == nil {
                if !current.isEmpty {
                    segments.append(TimeSeriesSegment(id: "\(id)-\(segments.count)", points: current))
                    current = []
                }
            } else {
                current.append(point)
            }
        }

        if !current.isEmpty {
            segments.append(TimeSeriesSegment(id: "\(id)-\(segments.count)", points: current))
        }
        return segments
    }
}

public struct TimeSeriesPresentation: Equatable, Sendable {
    public let title: String
    public let unit: String
    public let periodLabel: String
    public let series: [TimeSeries]

    public init(title: String, unit: String, periodLabel: String, series: [TimeSeries]) {
        self.title = title
        self.unit = unit
        self.periodLabel = periodLabel
        self.series = series
    }
}
