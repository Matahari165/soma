public enum HealthDomain: String, Equatable, Sendable { case recovery, effort, sleep, meal }

public struct DomainIndicatorPresentation: Equatable, Sendable {
    public let domain: HealthDomain
    public let title: String
    public let score: Double
    public let scoreLabel: String
    public let detail: String
    public let coverage: Double?
    public let provenance: DataProvenance
    public let components: [MetricComponentPresentation]

    public init(domain: HealthDomain, title: String, score: Double, scoreLabel: String, detail: String, coverage: Double?, provenance: DataProvenance, components: [MetricComponentPresentation] = []) {
        self.domain = domain
        self.title = title
        self.score = score
        self.scoreLabel = scoreLabel
        self.detail = detail
        self.coverage = coverage
        self.provenance = provenance
        self.components = components
    }
}
