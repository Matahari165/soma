public struct SegmentDatum: Identifiable, Equatable, Sendable {
    public let id: String
    public let label: String
    public let value: Double?
    public let unit: String

    public init(id: String, label: String, value: Double?, unit: String) {
        self.id = id
        self.label = label
        self.value = value
        self.unit = unit
    }
}

public struct SegmentedBarPresentation: Equatable, Sendable {
    public let title: String
    public let totalLabel: String?
    public let segments: [SegmentDatum]
    public let provenance: DataProvenance

    public init(title: String, totalLabel: String? = nil, segments: [SegmentDatum], provenance: DataProvenance) {
        self.title = title
        self.totalLabel = totalLabel
        self.segments = segments
        self.provenance = provenance
    }
}
