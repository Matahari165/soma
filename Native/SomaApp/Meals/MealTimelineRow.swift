import SwiftUI
import SomaCore

struct MealTimelineRow: View {
    let type: MealType
    let meal: Meal?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(type.label)
                    if let note = meal?.note, !note.isEmpty {
                        Text(note)
                            .font(.callout)
                            .foregroundStyle(SomaTheme.secondary)
                            .lineLimit(2)
                    } else if let meal, !meal.photos.isEmpty {
                        Text("\(meal.photos.count) photo\(meal.photos.count == 1 ? "" : "s")")
                            .font(.callout)
                            .foregroundStyle(SomaTheme.secondary)
                    }
                }
                Spacer(minLength: 16)
                Label(status.label, systemImage: status.symbol)
                    .font(.system(.callout, design: .monospaced))
                    .foregroundStyle(status.color)
                Image(systemName: "chevron.right")
                    .foregroundStyle(SomaTheme.secondary)
                    .accessibilityHidden(true)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .frame(minHeight: 52)
        .accessibilityLabel("\(type.label), \(status.label)")
        .accessibilityHint(meal == nil ? "Créer ce repas" : "Ouvrir le détail du repas")
    }

    private var status: MealDisplayStatus { MealDisplayStatus(meal: meal) }
}

private struct MealDisplayStatus {
    let label: String
    let symbol: String
    let color: Color

    init(meal: Meal?) {
        guard let meal else {
            label = "Absent"; symbol = "circle.dashed"; color = SomaTheme.secondary
            return
        }
        if meal.entryState == .skipped {
            label = "Ignoré"; symbol = "minus.circle"; color = SomaTheme.warning
        } else if meal.analysis?.status == "queued" || meal.analysis?.status == "running" {
            label = "En analyse"; symbol = "hourglass"; color = SomaTheme.secondary
        } else if meal.analysis?.status == "failed" {
            label = "Erreur"; symbol = "exclamationmark.triangle"; color = SomaTheme.warning
        } else if meal.status == .confirmed {
            label = "Confirmé"; symbol = "checkmark.circle"; color = SomaTheme.signal
        } else if meal.analysis?.status == "completed" {
            label = "À confirmer"; symbol = "questionmark.circle"; color = SomaTheme.primary
        } else {
            label = "Saisi"; symbol = "pencil.line"; color = SomaTheme.primary
        }
    }
}
