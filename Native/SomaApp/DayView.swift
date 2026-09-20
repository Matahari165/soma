import Foundation
import SwiftUI
import SomaCore

struct DayView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var mealEditor: MealEditorTarget?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                dateHeader
                overviewSection
                JournalSectionView()
                meals
            }
            .padding(.horizontal, horizontalSizeClass == .compact ? 16 : 24)
            .padding(.top, 24)
            .padding(.bottom, bottomContentPadding)
            .frame(maxWidth: 920, alignment: .leading)
        }
        .navigationTitle("Jour")
        .task {
            if model.overview == nil { await model.refreshOverview() }
        }
        .refreshable {
            await model.refreshOverview()
            try? await model.refreshDay()
        }
        .sheet(item: $mealEditor) { target in
            MealEditorView(mealType: target.type, mealID: target.mealID)
        }
    }

    private var bottomContentPadding: CGFloat {
        #if os(iOS)
        96
        #else
        24
        #endif
    }

    private var dateHeader: some View {
        HStack {
            Button("Jour précédent", systemImage: "chevron.left") { Task { await model.shiftDate(by: -1) } }
                .labelStyle(.iconOnly)
                .frame(width: 44, height: 44)
            Text(model.activeDate.rawValue).font(SomaTheme.numberFont(19)).accessibilityLabel("Date active, \(model.activeDate.rawValue)")
            Button("Jour suivant", systemImage: "chevron.right") { Task { await model.shiftDate(by: 1) } }
                .labelStyle(.iconOnly)
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
    }

    @ViewBuilder
    private var overviewSection: some View {
        if let overview = model.overview, overview.todayDate == model.activeDate.rawValue {
            OverviewSummaryView(overview: overview)
        } else if model.overview == nil, model.isOverviewLoading {
            ContentStateView(kind: .loading("Chargement des signaux du jour…"))
        } else if model.overview == nil, let message = model.overviewErrorMessage {
            ContentStateView(kind: .error(message: message, retry: { Task { await model.refreshOverview() } }))
        }
    }

    private var meals: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Repas")
                .font(.system(.title2, design: .serif))
                .accessibilityAddTraits(.isHeader)
            if let slots = model.day?.meals {
                ForEach(mealRows(slots), id: \.type) { row in
                    Button {
                        Task {
                            await model.openMeal(row.type)
                            mealEditor = MealEditorTarget(type: row.type, mealID: row.meal?.id)
                        }
                    } label: {
                        HStack {
                        Text(row.label)
                        Spacer()
                        if let meal = row.meal {
                            Text(meal.entryState == "skipped" ? "Ignoré" : meal.status == "confirmed" ? "Confirmé" : "Brouillon")
                                .foregroundStyle(meal.entryState == "skipped" ? SomaTheme.warning : SomaTheme.primary)
                        } else { Text("Absent").foregroundStyle(SomaTheme.secondary) }
                        Image(systemName: "chevron.right").foregroundStyle(SomaTheme.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: 44)
                    .accessibilityLabel("\(row.label), \(row.meal?.entryState == "skipped" ? "ignoré" : row.meal?.status == "confirmed" ? "confirmé" : row.meal == nil ? "absent" : "brouillon")")
                }
            }
        }
    }

    private func mealRows(_ slots: MealSlots) -> [(type: MealType, label: String, meal: MealSummary?)] {
        [
            (.breakfast, "Petit-déjeuner", slots.breakfast),
            (.lunch, "Déjeuner", slots.lunch),
            (.dinner, "Dîner", slots.dinner),
            (.snack, "Collation", slots.snack),
        ]
    }

}

private struct OverviewSummaryView: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    let overview: NativeOverviewResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text("Signaux du jour")
                    .font(.system(.title2, design: .serif))
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 12)
                Text(overview.todayDate)
                    .font(SomaTheme.numberFont(12))
                    .foregroundStyle(SomaTheme.secondary)
            }

            if horizontalSizeClass == .compact {
                OverviewRadarView(today: overview.today)
                    .frame(maxWidth: 320)
                    .frame(maxWidth: .infinity, alignment: .center)
                signalList
            } else {
                HStack(alignment: .top, spacing: 24) {
                    OverviewRadarView(today: overview.today)
                        .frame(width: 252)
                    signalList
                        .frame(maxWidth: 430, alignment: .leading)
                }
            }

            Text("Les mesures viennent des sources indiquées ; les scores et moyennes sont calculés par Soma.")
                .font(.caption)
                .foregroundStyle(SomaTheme.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var signalList: some View {
        VStack(alignment: .leading, spacing: 0) {
            OverviewSignalRow(
                label: "Sommeil",
                value: formatDuration(overview.today.sleepMinutes),
                comparison: comparison(value: overview.today.sleepMinutes, average: overview.today.averageSleepMinutes),
                source: overview.today.provenance.sleep.label
            )
            Divider().overlay(SomaTheme.rule)
            OverviewSignalRow(
                label: "Récupération",
                value: formatScore(overview.today.recoveryScore),
                comparison: comparison(value: overview.today.recoveryScore, average: overview.today.averageRecoveryScore),
                source: overview.today.provenance.recovery.label
            )
            Divider().overlay(SomaTheme.rule)
            OverviewSignalRow(
                label: "Effort",
                value: formatScore(overview.today.effortScore),
                comparison: effortComparison,
                source: effortSource
            )
            Divider().overlay(SomaTheme.rule)
            OverviewSignalRow(
                label: "Calories",
                value: formatCalories(overview.today.caloriesKcal),
                comparison: calorieComparison,
                source: overview.today.provenance.calories.label
            )
        }
        .accessibilityElement(children: .contain)
    }

    private var effortSource: String {
        guard let coverage = overview.today.effortCoverage else { return overview.today.provenance.effort.label }
        return "\(overview.today.provenance.effort.label) · couverture \(formatPercentage(coverage))"
    }

    private var effortComparison: String {
        comparison(value: overview.today.effortScore, average: overview.today.averageEffortScore)
    }

    private var calorieComparison: String {
        let target = overview.today.calorieTarget
        let targetText = target.map { "Cible \(formatCalories($0))" } ?? "Cible indisponible"
        let averageText = overview.today.averageCaloriesKcal.map { "Moy. 30 j \(formatCalories($0))" } ?? "Moy. 30 j —"
        return "\(targetText) · \(averageText)"
    }

    private func comparison(value: Double?, average: Double?) -> String {
        guard let value, let average else { return "Moy. 30 j —" }
        let delta = value - average
        if abs(delta) < 0.5 { return "Moy. 30 j · stable" }
        return delta > 0 ? "Moy. 30 j · ↑" : "Moy. 30 j · ↓"
    }

    private func formatDuration(_ value: Double?) -> String {
        guard let value else { return "—" }
        let minutes = max(0, Int(value.rounded()))
        return "\(minutes / 60) h \(String(format: "%02d", minutes % 60))"
    }

    private func formatScore(_ value: Double?) -> String {
        guard let value else { return "—" }
        return value.formatted(.number.precision(.fractionLength(0)))
    }

    private func formatCalories(_ value: Double?) -> String {
        guard let value else { return "—" }
        return "\(value.formatted(.number.precision(.fractionLength(0)))) kcal"
    }

    private func formatPercentage(_ value: Double) -> String {
        "\((value * 100).formatted(.number.precision(.fractionLength(0)))) %"
    }
}

private struct OverviewSignalRow: View {
    let label: String
    let value: String
    let comparison: String
    let source: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(.body)
                Text(source)
                    .font(.caption)
                    .foregroundStyle(SomaTheme.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 12)
            VStack(alignment: .trailing, spacing: 4) {
                Text(value)
                    .font(SomaTheme.numberFont())
                Text(comparison)
                    .font(.caption)
                    .foregroundStyle(SomaTheme.secondary)
                    .multilineTextAlignment(.trailing)
            }
        }
        .frame(minHeight: 56)
        .accessibilityElement(children: .combine)
    }
}

private struct OverviewRadarView: View {
    let today: NativeOverviewToday

    private let axes = [
        "Sommeil",
        "Récupération",
        "Effort",
        "Calories",
    ]

    var body: some View {
        VStack(spacing: 8) {
            GeometryReader { proxy in
                let side = min(proxy.size.width, proxy.size.height)
                let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2)
                let radius = max(0, side / 2 - 42)
                ZStack {
                    ForEach(1...4, id: \.self) { level in
                        radarPath(center: center, radius: radius * CGFloat(level) / 4)
                            .stroke(SomaTheme.rule.opacity(level == 4 ? 0.9 : 0.55), lineWidth: 1)
                    }
                    ForEach(0..<axes.count, id: \.self) { index in
                        let endpoint = point(index: index, ratio: 1, center: center, radius: radius)
                        Path { path in
                            path.move(to: center)
                            path.addLine(to: endpoint)
                        }
                        .stroke(SomaTheme.rule.opacity(0.65), lineWidth: 1)
                    }
                    valueShape(center: center, radius: radius)
                    ForEach(Array(axes.enumerated()), id: \.offset) { index, label in
                        let location = labelPoint(index: index, center: center, radius: radius)
                        VStack(spacing: 2) {
                            Text(label)
                                .font(.caption)
                            Text(displayValue(for: index))
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(SomaTheme.secondary)
                        }
                        .position(location)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(accessibilityLabel(for: index, label: label))
                    }
                }
            }
            .aspectRatio(1, contentMode: .fit)

            Text("Contour = repère disponible")
                .font(.caption2)
                .foregroundStyle(SomaTheme.secondary)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Résumé radar des signaux du jour")
    }

    private func ratios() -> [Double?] {
        let calorieRatio: Double? = if let calories = today.caloriesKcal, let target = today.calorieTarget, target > 0 {
            min(max(calories / target, 0), 1)
        } else {
            nil
        }
        return [
            today.sleepMinutes.map { min(max($0 / 510, 0), 1) },
            today.recoveryScore.map { min(max($0 / 100, 0), 1) },
            today.effortScore.map { min(max($0 / 100, 0), 1) },
            calorieRatio,
        ]
    }

    @ViewBuilder
    private func valueShape(center: CGPoint, radius: CGFloat) -> some View {
        let values = ratios()
        let points = values.enumerated().compactMap { index, ratio in
            ratio.map { point(index: index, ratio: $0, center: center, radius: radius) }
        }
        if points.count == values.count {
            radarPath(points: points)
                .fill(SomaTheme.signal.opacity(0.14))
                .overlay(radarPath(points: points).stroke(SomaTheme.signal, lineWidth: 1.5))
        } else {
            ForEach(Array(values.enumerated()), id: \.offset) { index, ratio in
                if let ratio {
                    Circle()
                        .fill(SomaTheme.signal)
                        .frame(width: 6, height: 6)
                        .position(point(index: index, ratio: ratio, center: center, radius: radius))
                }
            }
        }
    }

    private func radarPath(center: CGPoint, radius: CGFloat) -> Path {
        radarPath(points: (0..<axes.count).map { point(index: $0, ratio: 1, center: center, radius: radius) })
    }

    private func radarPath(points: [CGPoint]) -> Path {
        Path { path in
            guard let first = points.first else { return }
            path.move(to: first)
            for point in points.dropFirst() { path.addLine(to: point) }
            path.closeSubpath()
        }
    }

    private func point(index: Int, ratio: Double, center: CGPoint, radius: CGFloat) -> CGPoint {
        let angle = (-Double.pi / 2) + (Double(index) * 2 * Double.pi / Double(axes.count))
        return CGPoint(
            x: center.x + CGFloat(cos(angle) * Double(radius) * ratio),
            y: center.y + CGFloat(sin(angle) * Double(radius) * ratio)
        )
    }

    private func labelPoint(index: Int, center: CGPoint, radius: CGFloat) -> CGPoint {
        point(index: index, ratio: 1.28, center: center, radius: radius)
    }

    private func displayValue(for index: Int) -> String {
        switch index {
        case 0: return duration(today.sleepMinutes)
        case 1: return score(today.recoveryScore)
        case 2: return score(today.effortScore)
        default: return calories(today.caloriesKcal)
        }
    }

    private func accessibilityLabel(for index: Int, label: String) -> String {
        let value = displayValue(for: index)
        let source: String = switch index {
        case 0: today.provenance.sleep.label
        case 1: today.provenance.recovery.label
        case 2: today.provenance.effort.label
        default: today.provenance.calories.label
        }
        return "\(label) : \(value). Source : \(source)."
    }

    private func duration(_ value: Double?) -> String {
        guard let value else { return "—" }
        let minutes = max(0, Int(value.rounded()))
        return "\(minutes / 60) h \(String(format: "%02d", minutes % 60))"
    }

    private func score(_ value: Double?) -> String {
        guard let value else { return "—" }
        return value.formatted(.number.precision(.fractionLength(0)))
    }

    private func calories(_ value: Double?) -> String {
        guard let value else { return "—" }
        return value.formatted(.number.precision(.fractionLength(0)))
    }
}
