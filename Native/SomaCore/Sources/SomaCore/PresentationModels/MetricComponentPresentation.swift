public struct MetricComponentPresentation: Identifiable, Equatable, Sendable {
    public let id: String
    public let label: String
    public let rawValueLabel: String?
    public let normalizedValue: Double?
    public let targetLabel: String?
    public let weight: Double
    public let contribution: Double?
    public let provenance: DataProvenance

    public init(id: String, label: String, rawValueLabel: String?, normalizedValue: Double?, targetLabel: String?, weight: Double, contribution: Double?, provenance: DataProvenance) {
        self.id = id
        self.label = label
        self.rawValueLabel = rawValueLabel
        self.normalizedValue = normalizedValue
        self.targetLabel = targetLabel
        self.weight = weight
        self.contribution = contribution
        self.provenance = provenance
    }
}
