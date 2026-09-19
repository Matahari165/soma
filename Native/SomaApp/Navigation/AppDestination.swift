import SwiftUI

enum AppDestination: String, CaseIterable, Identifiable {
    case day
    case analysis
    case health
    case meals
    case sleep
    case recovery
    case activity
    case export
    case settings

    var id: Self { self }

    var title: String {
        switch self {
        case .day: "Jour"
        case .analysis: "Analyse"
        case .health: "Santé"
        case .meals: "Repas"
        case .sleep: "Sommeil"
        case .recovery: "Récupération"
        case .activity: "Effort"
        case .export: "Export"
        case .settings: "Paramètres"
        }
    }

    var systemImage: String {
        switch self {
        case .day: "calendar"
        case .analysis: "waveform.path.ecg"
        case .health: "heart.text.square"
        case .meals: "fork.knife"
        case .sleep: "moon.zzz"
        case .recovery: "heart.circle"
        case .activity: "figure.run"
        case .export: "square.and.arrow.up"
        case .settings: "gearshape"
        }
    }
}
