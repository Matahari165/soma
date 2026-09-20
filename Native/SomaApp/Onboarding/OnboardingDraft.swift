import Foundation
import SomaCore

struct OnboardingDraft: Equatable {
    var displayName: String
    var dateOfBirth = ""
    var heightCm = ""
    var weightKg = ""
    var sex: HealthCalculationSex = .preferNotToSay
    var primaryGoal: FitnessGoal = .maintainHealth
    var sleepTargetMinutes = 510
    var usualWakeTime = DateComponents(hour: 7, minute: 0)
    var importRange: HealthImportRange = .allHistory

    init(displayName: String) {
        self.displayName = displayName
    }

    var profileIsValid: Bool {
        guard !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              displayName.count <= 80,
              dateOfBirth.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
              let birthDate = try? Date(dateOfBirth, strategy: .iso8601.year().month().day()),
              birthDate <= .now,
              let height = Double(heightCm), (50...260).contains(height),
              let weight = Double(weightKg), (20...400).contains(weight)
        else { return false }
        return true
    }

    var request: OnboardingRequest? {
        guard profileIsValid,
              let height = Double(heightCm),
              let weight = Double(weightKg),
              let hour = usualWakeTime.hour,
              let minute = usualWakeTime.minute
        else { return nil }
        return OnboardingRequest(
            displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
            dateOfBirth: dateOfBirth,
            heightCm: height,
            weightKg: weight,
            sexForHealthCalculations: sex,
            primaryGoal: primaryGoal,
            baseSleepTargetMinutes: sleepTargetMinutes,
            usualWakeTime: String(format: "%02d:%02d", hour, minute),
            importRange: importRange,
            timezone: TimeZone.current.identifier
        )
    }
}

extension FitnessGoal {
    var label: String {
        switch self {
        case .buildMuscle: "Développer ma masse musculaire"
        case .improveEndurance: "Améliorer mon endurance"
        case .improveCardio: "Améliorer ma forme cardiovasculaire"
        case .generalFitness: "Améliorer ma forme générale"
        case .maintainHealth: "Préserver ma santé"
        case .other: "Autre objectif"
        }
    }
}

extension HealthCalculationSex {
    var label: String {
        switch self {
        case .female: "Féminin"
        case .male: "Masculin"
        case .intersex: "Intersexe"
        case .preferNotToSay: "Ne pas préciser"
        }
    }
}

extension HealthImportRange {
    var label: String {
        switch self {
        case .ninetyDays: "90 derniers jours"
        case .allHistory: "Tout l’historique disponible"
        }
    }
}
