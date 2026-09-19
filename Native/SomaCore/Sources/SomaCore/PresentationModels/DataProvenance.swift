public enum DataProvenance: Equatable, Sendable {
    case healthSource(name: String)
    case somaCalculation(version: String?)

    public var label: String {
        switch self {
        case .healthSource(let name): "Source sante : \(name)"
        case .somaCalculation: "Calcule par Soma"
        }
    }
}
