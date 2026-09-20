import Foundation
import SwiftUI
import SomaCore

struct DayView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    @State private var mealEditor: MealEditorTarget?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                arrival
                dayPicker
                dayContent
            }
            .padding(.bottom, bottomContentPadding)
            .frame(maxWidth: 1120, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .coordinateSpace(name: "dayScroll")
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

    private var arrival: some View {
        ZStack(alignment: .topLeading) {
            GeometryReader { geometry in
                let scrollOffset = geometry.frame(in: .named("dayScroll")).minY
                Image("DayMountainBackdrop")
                    .resizable()
                    .scaledToFill()
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .scaleEffect(accessibilityReduceMotion ? 1 : 1.05)
                    .offset(y: mountainOffset(for: scrollOffset))
                    .clipped()
            }
            LinearGradient(colors: [.black.opacity(0.68), .black.opacity(0.52), SomaTheme.canvas], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 16) {
                Text("\(greetingName),\ngarde le fil.")
                    .font(.system(size: horizontalSizeClass == .compact ? 42 : 56, weight: .regular, design: .serif))
                    .tracking(-1.5)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                dateHeader
                journalProgress
                overviewSection
            }
            .padding(.horizontal, horizontalSizeClass == .compact ? 20 : 32)
            .padding(.top, horizontalSizeClass == .compact ? 24 : 36)
            .padding(.bottom, 26)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: horizontalSizeClass == .compact ? 500 : 560)
        .clipped()
    }

    private func mountainOffset(for scrollOffset: CGFloat) -> CGFloat {
        guard !accessibilityReduceMotion else { return 0 }
        return min(max(-scrollOffset * 0.12, -12), 18)
    }

    private var greetingName: String {
        let name = model.currentUser?.displayName.split(separator: " ").first.map(String.init)
        return name.flatMap { $0.isEmpty ? nil : $0 } ?? "Bonjour"
    }

    private var dateHeader: some View {
        HStack(spacing: 8) {
            Button("Jour précédent", systemImage: "chevron.left") { Task { await model.shiftDate(by: -1) } }
                .labelStyle(.iconOnly)
                .frame(width: 44, height: 44)
                .disabled(model.isPreviewMode)
            Text(formattedDate(model.activeDate))
                .font(SomaTheme.numberFont(12))
                .accessibilityLabel("Date active, \(formattedDate(model.activeDate))")
            Button("Jour suivant", systemImage: "chevron.right") { Task { await model.shiftDate(by: 1) } }
                .labelStyle(.iconOnly)
                .frame(width: 44, height: 44)
                .disabled(model.isPreviewMode)
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
    }

    private var journalProgress: some View {
        let active = model.day?.variables.filter(\.isActive) ?? []
        let completed = model.journalDraft?.completedCount(for: active) ?? 0
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("JOURNAL RENSEIGNÉ")
                Spacer()
                Text("\(completed) / \(active.count)")
            }
            .font(SomaTheme.numberFont(11))
            .foregroundStyle(SomaTheme.secondary)
            ProgressView(value: Double(completed), total: Double(max(active.count, 1)))
                .tint(SomaTheme.primary)
                .accessibilityLabel("Journal renseigné")
                .accessibilityValue("\(completed) sur \(active.count)")
        }
        .frame(maxWidth: 330)
    }

    private var dayPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { offset in
                    let date = (try? model.activeDate.adding(days: -offset)) ?? model.activeDate
                    let selected = date == model.activeDate
                    let isToday = date.rawValue == (try? LocalDate.today())?.rawValue
                    Button {
                        guard !selected else { return }
                        Task { await model.shiftDate(by: -offset) }
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(isToday ? "Aujourd’hui" : shortDate(date))
                                .font(SomaTheme.numberFont(12))
                            Text(selected ? journalCountLabel : "—")
                                .font(.caption)
                                .foregroundStyle(SomaTheme.secondary)
                        }
                        .frame(minWidth: 108, minHeight: 48, alignment: .leading)
                        .padding(.horizontal, 12)
                        .background(selected ? SomaTheme.surface : .clear)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .disabled(model.isPreviewMode && !selected)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, horizontalSizeClass == .compact ? 12 : 24)
        .overlay(alignment: .bottom) { SomaTheme.rule.frame(height: 1) }
    }

    @ViewBuilder
    private var dayContent: some View {
        if horizontalSizeClass == .compact {
            VStack(alignment: .leading, spacing: 32) {
                meals
                JournalSectionView()
            }
            .padding(.horizontal, 16)
            .padding(.top, 28)
        } else {
            HStack(alignment: .top, spacing: 32) {
                JournalSectionView().frame(maxWidth: .infinity, alignment: .leading)
                meals.frame(width: 300, alignment: .leading)
            }
            .padding(.horizontal, 32)
            .padding(.top, 32)
        }
    }

    private var journalCountLabel: String {
        let active = model.day?.variables.filter(\.isActive) ?? []
        let completed = model.journalDraft?.completedCount(for: active) ?? 0
        return "\(completed)/\(active.count)"
    }

    private func formattedDate(_ date: LocalDate) -> String {
        guard let value = Self.inputDateFormatter.date(from: date.rawValue) else { return date.rawValue }
        return Self.longDateFormatter.string(from: value)
    }

    private func shortDate(_ date: LocalDate) -> String {
        guard let value = Self.inputDateFormatter.date(from: date.rawValue) else { return date.rawValue }
        return Self.shortDateFormatter.string(from: value)
    }

    private static let inputDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .iso8601)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let longDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_CH")
        formatter.dateFormat = "EEEE d MMMM"
        return formatter
    }()

    private static let shortDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_CH")
        formatter.dateFormat = "d EEE"
        return formatter
    }()

    @ViewBuilder
    private var overviewSection: some View {
        if let overview = model.overview,
           overview.todayDate == model.activeDate.rawValue || overview.today.history.contains(where: { $0.date == model.activeDate.rawValue }) {
            OverviewSummaryView(overview: overview, selectedDate: model.activeDate.rawValue)
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
                        HStack(alignment: .top, spacing: 10) {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(row.label)
                                if let note = row.meal?.note, !note.isEmpty {
                                    Text(note)
                                        .font(.callout)
                                        .foregroundStyle(SomaTheme.secondary)
                                        .lineLimit(2)
                                }
                            }
                            Spacer(minLength: 8)
                            if let meal = row.meal {
                                Text(meal.entryState == "skipped" ? "Ignoré" : meal.status == "confirmed" ? "Confirmé" : "Brouillon")
                                    .font(.caption)
                                    .foregroundStyle(meal.entryState == "skipped" ? SomaTheme.warning : SomaTheme.primary)
                            } else { Text("Absent").font(.caption).foregroundStyle(SomaTheme.secondary) }
                            Image(systemName: "chevron.right").foregroundStyle(SomaTheme.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: 64)
                    .overlay(alignment: .bottom) { SomaTheme.rule.frame(height: 1) }
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
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    @State private var radarIsVisible = false

    let overview: NativeOverviewResponse
    let selectedDate: String

    var body: some View {
        OverviewRadarView(today: overview.today, historyPoint: selectedDate == overview.todayDate ? nil : overview.today.history.first(where: { $0.date == selectedDate }))
            .frame(width: horizontalSizeClass == .compact ? 300 : 360)
            .frame(maxWidth: .infinity)
            .opacity(radarIsVisible || accessibilityReduceMotion ? 1 : 0.65)
            .scaleEffect(accessibilityReduceMotion || radarIsVisible ? 1 : 0.96)
            .offset(y: accessibilityReduceMotion || radarIsVisible ? 0 : 10)
            .onAppear {
                guard !radarIsVisible else { return }
                guard !accessibilityReduceMotion else {
                    radarIsVisible = true
                    return
                }
                withAnimation(.easeOut(duration: 0.56)) {
                    radarIsVisible = true
                }
            }
    }

}

private struct OverviewRadarView: View {
    let today: NativeOverviewToday
    let historyPoint: NativeOverviewHistoryPoint?

    private var sleepMinutes: Double? { historyPoint == nil ? today.sleepMinutes : historyPoint?.sleepMinutes }
    private var recoveryScore: Double? { historyPoint == nil ? today.recoveryScore : historyPoint?.recoveryScore }
    private var effortScore: Double? { historyPoint == nil ? today.effortScore : historyPoint?.effortScore }
    private var caloriesKcal: Double? { historyPoint == nil ? today.caloriesKcal : historyPoint?.caloriesKcal }
    private var calorieTarget: Double? { historyPoint == nil ? today.calorieTarget : historyPoint?.calorieTarget }

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
                            .stroke(SomaTheme.primary.opacity(level == 4 ? 0.44 : 0.18), lineWidth: 1)
                    }
                    ForEach(0..<axes.count, id: \.self) { index in
                        let endpoint = point(index: index, ratio: 1, center: center, radius: radius)
                        Path { path in
                            path.move(to: center)
                            path.addLine(to: endpoint)
                        }
                        .stroke(SomaTheme.primary.opacity(0.22), lineWidth: 1)
                    }
                    valueShape(center: center, radius: radius)
                    ForEach(Array(axes.enumerated()), id: \.offset) { index, label in
                        let location = labelPoint(index: index, center: center, radius: radius)
                        VStack(spacing: 2) {
                            Text(label)
                                .font(.system(size: 13))
                            Text(displayValue(for: index))
                                .font(SomaTheme.numberFont(12))
                                .foregroundStyle(SomaTheme.primary)
                        }
                        .position(location)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(accessibilityLabel(for: index, label: label))
                    }
                }
            }
            .aspectRatio(1, contentMode: .fit)

        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Résumé radar des signaux du jour")
    }

    private func ratios() -> [Double?] {
        let calorieRatio: Double? = if let calories = caloriesKcal, let target = calorieTarget, target > 0 {
            min(max(calories / target, 0), 1)
        } else {
            nil
        }
        return [
            sleepMinutes.map { min(max($0 / 510, 0), 1) },
            recoveryScore.map { min(max($0 / 100, 0), 1) },
            effortScore.map { min(max($0 / 100, 0), 1) },
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
        case 0: return duration(sleepMinutes)
        case 1: return score(recoveryScore)
        case 2: return score(effortScore)
        default: return calories(caloriesKcal)
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
