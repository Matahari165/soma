import SwiftUI
import SomaCore

struct MealAnalysisResultView: View {
    let result: MealAnalysisResult

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Résultats nutritionnels")
                .font(.system(.title2, design: .serif))
                .accessibilityAddTraits(.isHeader)
            Text(result.summary)
            nutritionGrid
            if !result.foods.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Aliments identifiés").font(.headline)
                    ForEach(Array(result.foods.enumerated()), id: \.offset) { _, food in
                        HStack(alignment: .firstTextBaseline) {
                            Text(food.name)
                            Spacer()
                            Text([food.portion, food.preparation].compactMap { $0 }.joined(separator: " · "))
                                .font(.callout)
                                .foregroundStyle(SomaTheme.secondary)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                }
            }
            Text("Confiance : \(confidenceLabel)")
                .font(.callout)
                .foregroundStyle(SomaTheme.secondary)
            if !result.uncertainties.isEmpty {
                Text(result.uncertainties.joined(separator: " · "))
                    .font(.callout)
                    .foregroundStyle(SomaTheme.secondary)
            }
        }
    }

    private var nutritionGrid: some View {
        Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 12) {
            nutritionRow("Énergie", result.totals.calories, unit: "kcal")
            nutritionRow("Protéines", result.totals.proteinGrams, unit: "g")
            nutritionRow("Glucides", result.totals.carbohydrateGrams, unit: "g")
            nutritionRow("Lipides", result.totals.fatGrams, unit: "g")
            nutritionRow("Fibres", result.totals.fiberGrams, unit: "g")
        }
        .accessibilityElement(children: .contain)
    }

    private func nutritionRow(_ label: String, _ range: NutritionRange?, unit: String) -> some View {
        GridRow {
            Text(label).foregroundStyle(SomaTheme.secondary)
            if let range {
                Text(range.likely, format: .number.precision(.fractionLength(0...1)))
                    .font(.system(.body, design: .monospaced))
                Text(unit).foregroundStyle(SomaTheme.secondary)
                Text("\(range.low.formatted(.number.precision(.fractionLength(0...1))))–\(range.high.formatted(.number.precision(.fractionLength(0...1))))")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.secondary)
                    .accessibilityLabel("intervalle de \(range.low.formatted()) à \(range.high.formatted()) \(unit)")
            } else {
                Text("—")
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(SomaTheme.secondary)
                    .accessibilityLabel("Indisponible")
                Text(unit).foregroundStyle(SomaTheme.secondary)
                Text("Indisponible").font(.caption).foregroundStyle(SomaTheme.secondary)
            }
        }
    }

    private var confidenceLabel: String {
        switch result.confidence {
        case "high": "élevée"
        case "medium": "moyenne"
        default: "faible"
        }
    }
}
