public extension MealType {
    var label: String {
        switch self {
        case .breakfast: "Petit-déjeuner"
        case .lunch: "Déjeuner"
        case .dinner: "Dîner"
        case .snack: "Collation"
        }
    }
}

public extension MealPhotoOrigin {
    var label: String {
        switch self {
        case .homemade: "Maison"
        case .prepared: "Préparé / acheté"
        case .mixed: "Mixte"
        case .unknown: "À préciser"
        }
    }
}
