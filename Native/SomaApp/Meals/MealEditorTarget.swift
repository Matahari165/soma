import SomaCore

struct MealEditorTarget: Identifiable {
    let type: MealType
    let mealID: String?

    var id: String { mealID ?? "new-\(type.rawValue)" }
}
