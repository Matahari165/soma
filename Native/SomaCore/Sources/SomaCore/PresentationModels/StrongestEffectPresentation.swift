public enum EffectDirection: Equatable, Sendable { case favorable, unfavorable, neutral }

public struct StrongestEffectPresentation: Identifiable, Equatable, Sendable {
    public let id: String
    public let predictor: String
    public let outcome: String
    public let effect: Double
    public let confidenceRange: ClosedRange<Double>?
    public let sampleSize: Int
    public let lagLabel: String
    public let periodLabel: String
    public let direction: EffectDirection
    public let qValue: Double?
    public let stability: Double?
    public let isEligible: Bool

    public init(id: String, predictor: String, outcome: String, effect: Double, confidenceRange: ClosedRange<Double>? = nil, sampleSize: Int, lagLabel: String, periodLabel: String, direction: EffectDirection, qValue: Double? = nil, stability: Double? = nil, isEligible: Bool = true) {
        self.id = id
        self.predictor = predictor
        self.outcome = outcome
        self.effect = effect
        self.confidenceRange = confidenceRange
        self.sampleSize = sampleSize
        self.lagLabel = lagLabel
        self.periodLabel = periodLabel
        self.direction = direction
        self.qValue = qValue
        self.stability = stability
        self.isEligible = isEligible
    }
}
