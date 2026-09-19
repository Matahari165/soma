import SwiftUI

enum AppDestination: String, CaseIterable, Identifiable {
    case day
    case analysis
    case meals
    case sleep
    case recovery
    case activity
    case settings

    var id: Self { self }

    var title: String {
        switch self {
        case .day: "Jour"
        case .analysis: "Analyse"
        case .meals: "Repas"
        case .sleep: "Sommeil"
        case .recovery: "Récupération"
        case .activity: "Effort"
        case .settings: "Paramètres"
        }
    }

    var systemImage: String {
        switch self {
        case .day: "calendar"
        case .analysis: "waveform.path.ecg"
        case .meals: "fork.knife"
        case .sleep: "moon.zzz"
        case .recovery: "heart.text.square"
        case .activity: "figure.run"
        case .settings: "gearshape"
        }
    }
}
