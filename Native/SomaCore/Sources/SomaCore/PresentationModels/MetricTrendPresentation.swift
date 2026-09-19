public enum TrendDirection: Equatable, Sendable { case improving, stable, declining }

public struct MetricTrendPresentation: Equatable, Sendable {
    public let title: String
    public let value: Double
    public let unit: String
    public let comparison: String
    public let direction: TrendDirection
    public let provenance: DataProvenance

    public init(title: String, value: Double, unit: String, comparison: String, direction: TrendDirection, provenance: DataProvenance) {
        self.title = title
        self.value = value
        self.unit = unit
        self.comparison = comparison
        self.direction = direction
        self.provenance = provenance
    }
}
