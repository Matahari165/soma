public enum DataAvailability<Value: Equatable & Sendable>: Equatable, Sendable {
    case available(Value)
    case partial(Value, note: String)
    case unavailable(reason: String)

    public var value: Value? {
        switch self {
        case .available(let value), .partial(let value, _): value
        case .unavailable: nil
        }
    }

    public var isPartial: Bool {
        if case .partial = self { true } else { false }
    }
}
