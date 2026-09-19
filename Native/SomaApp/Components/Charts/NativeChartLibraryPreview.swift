import SomaCore
import SwiftUI

#Preview("Bibliotheque - iPhone", traits: .fixedLayout(width: 390, height: 844)) {
    ScrollView {
        LazyVStack(alignment: .leading, spacing: 32) {
            DomainIndicatorBlock(data: .available(.init(domain: .recovery, title: "Recuperation", score: 74, scoreLabel: "74 / 100", detail: "Au-dessus de la reference recente", coverage: 0.82, provenance: .somaCalculation(version: "recovery-v1"))))
            TimeSeriesChart(data: .partial(.init(title: "Sommeil", unit: "h", periodLabel: "7 jours", series: [.init(id: "sleep", label: "Duree", points: PreviewChartData.sleep, provenance: .healthSource(name: "Donnees Sante"))]), note: "Une nuit sans mesure"))
            SegmentedBarChart(data: .available(.init(title: "Repas confirmes", totalLabel: "3 repas", segments: [.init(id: "breakfast", label: "Petit-dejeuner", value: 21, unit: "%"), .init(id: "lunch", label: "Dejeuner", value: 44, unit: "%"), .init(id: "dinner", label: "Diner", value: 35, unit: "%")], provenance: .somaCalculation(version: "meal-balance-v3"))))
            StrongestEffectsBlock(data: .available([.init(id: "walk-sleep", predictor: "Marche", outcome: "Sommeil", effect: 0.31, confidenceRange: 0.12...0.48, sampleSize: 28, lagLabel: "le lendemain", periodLabel: "30 jours", direction: .favorable)]))
            MetricTrendBlock(data: .unavailable(reason: "Aucune mesure disponible pour cette periode"))
        }
        .padding(24)
    }
    .somaScreen()
}

#Preview("Bibliothèque - Mac", traits: .fixedLayout(width: 1440, height: 900)) {
    ScrollView {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 32)], alignment: .leading, spacing: 48) {
            DomainIndicatorBlock(data: .available(.init(domain: .effort, title: "Effort", score: 61, scoreLabel: "61 / 100", detail: "Charge moderee", coverage: 1, provenance: .somaCalculation(version: "activity-v3"))))
            TimeSeriesChart(data: .available(.init(title: "Frequence cardiaque au repos", unit: "bpm", periodLabel: "7 jours", series: [.init(id: "rhr", label: "Mesuree", points: PreviewChartData.heartRate, provenance: .healthSource(name: "Donnees Sante"))])))
            MetricTrendBlock(data: .available(.init(title: "Duree moyenne", value: 7.4, unit: "h", comparison: "+ 18 min", direction: .improving, provenance: .healthSource(name: "Donnees Sante"))))
            StrongestEffectsBlock(data: .partial([], note: "Couverture insuffisante sur cette periode"))
        }
        .padding(40)
    }
    .somaScreen()
}

#Preview("Bibliothèque - largeur intermédiaire", traits: .fixedLayout(width: 820, height: 900)) {
    ScrollView {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 24)], alignment: .leading, spacing: 32) {
            DomainIndicatorBlock(data: .available(.init(domain: .sleep, title: "Sommeil", score: 68, scoreLabel: "68 / 100", detail: "Durée régulière", coverage: 0.71, provenance: .somaCalculation(version: "sleep-v1"))))
            SegmentedBarChart(data: .partial(.init(title: "Phases du sommeil", segments: [.init(id: "deep", label: "Profond", value: 19, unit: "%"), .init(id: "rem", label: "Paradoxal", value: nil, unit: "%"), .init(id: "light", label: "Léger", value: 56, unit: "%")], provenance: .healthSource(name: "Données Santé")), note: "Phase paradoxale indisponible"))
        }
        .padding(32)
    }
    .somaScreen()
}

private enum PreviewChartData {
    static let calendar = Calendar(identifier: .gregorian)
    static let start = calendar.date(from: DateComponents(year: 2026, month: 9, day: 12))!
    static let sleep = [7.1, 7.6, nil, 6.9, 7.8, 8.0, 7.4].enumerated().map { index, value in ChartPoint(id: "sleep-\(index)", date: calendar.date(byAdding: .day, value: index, to: start)!, value: value, label: "Jour \(index + 1)") }
    static let heartRate = [58, 57, 59, 56, 55, 57, 56].enumerated().map { index, value in ChartPoint(id: "rhr-\(index)", date: calendar.date(byAdding: .day, value: index, to: start)!, value: Double(value), label: "Jour \(index + 1)") }
}
