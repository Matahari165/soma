import SwiftUI
import SomaCore

struct OnboardingView: View {
    enum Step: Int, CaseIterable {
        case introduction, preferences, health

        var title: String {
            switch self {
            case .introduction: "Votre point de départ"
            case .preferences: "Vos repères"
            case .health: "Sources de santé"
            }
        }
    }

    @Environment(AppModel.self) private var model
    @State private var step = Step.introduction
    @State private var draft: OnboardingDraft
    @State private var validationMessage: String?
    @FocusState private var focusedField: Field?

    let onFinished: (Bool) -> Void

    init(displayName: String, onFinished: @escaping (Bool) -> Void) {
        _draft = State(initialValue: OnboardingDraft(displayName: displayName))
        self.onFinished = onFinished
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                header
                stepContent
                if let message = validationMessage ?? model.onboardingErrorMessage {
                    Label(message, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(SomaTheme.warning)
                        .accessibilityLabel("Erreur : \(message)")
                }
                navigation
            }
            .frame(maxWidth: 760, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.vertical, 32)
        }
        .somaScreen()
        .interactiveDismissDisabled()
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Soma")
                .font(.system(.largeTitle, design: .serif))
                .accessibilityAddTraits(.isHeader)
            ProgressView(value: Double(step.rawValue + 1), total: Double(Step.allCases.count)) {
                Text("Étape \(step.rawValue + 1) sur \(Step.allCases.count)")
                    .font(.system(.caption, design: .monospaced))
            }
            Text(step.title)
                .font(.system(.title, design: .serif))
                .focused($focusedField, equals: .heading)
                .accessibilityAddTraits(.isHeader)
        }
    }

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case .introduction:
            VStack(alignment: .leading, spacing: 20) {
                Text("Soma rapproche votre journal, vos repas et les signaux de santé que vous choisissez. Il montre des associations personnelles, jamais un diagnostic médical.")
                    .foregroundStyle(SomaTheme.secondary)
                TextField("Nom ou pseudonyme", text: $draft.displayName)
                    .textContentType(.name)
                    .focused($focusedField, equals: .name)
                TextField("Date de naissance · AAAA-MM-JJ", text: $draft.dateOfBirth)
                    .textContentType(.birthdate)
                    .focused($focusedField, equals: .birthDate)
                HStack {
                    TextField("Taille · cm", text: $draft.heightCm)
                    TextField("Poids · kg", text: $draft.weightKg)
                }
                .focused($focusedField, equals: .measurements)
                Picker("Sexe pour les calculs de santé", selection: $draft.sex) {
                    ForEach(HealthCalculationSex.allCases, id: \.self) { value in
                        Text(value.label).tag(value)
                    }
                }
                Text("Ces données servent uniquement à vos calculs personnels.")
                    .font(.callout)
                    .foregroundStyle(SomaTheme.secondary)
            }
            .textFieldStyle(.roundedBorder)

        case .preferences:
            VStack(alignment: .leading, spacing: 24) {
                Picker("Objectif principal", selection: $draft.primaryGoal) {
                    ForEach(FitnessGoal.allCases, id: \.self) { goal in
                        Text(goal.label).tag(goal)
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    LabeledContent("Objectif de sommeil") {
                        Text(Self.sleepLabel(draft.sleepTargetMinutes))
                            .font(.system(.body, design: .monospaced))
                    }
                    Slider(value: Binding(
                        get: { Double(draft.sleepTargetMinutes) },
                        set: { draft.sleepTargetMinutes = Int($0.rounded()) }
                    ), in: 300...660, step: 15)
                    .accessibilityValue(Self.sleepLabel(draft.sleepTargetMinutes))
                }
                DatePicker("Heure de réveil habituelle", selection: wakeTimeBinding, displayedComponents: .hourAndMinute)
                Picker("Historique à importer", selection: $draft.importRange) {
                    ForEach(HealthImportRange.allCases, id: \.self) { range in
                        Text(range.label).tag(range)
                    }
                }
                Text("Vous pourrez modifier vos habitudes du journal plus tard. Cette étape conserve seulement les repères nécessaires aux calculs.")
                    .foregroundStyle(SomaTheme.secondary)
            }

        case .health:
            VStack(alignment: .leading, spacing: 20) {
                Text("Vous gardez le contrôle : aucune source n’est obligatoire et une déconnexion ne supprime jamais automatiquement l’historique déjà importé.")
                    .foregroundStyle(SomaTheme.secondary)
                sourceRow(title: "Santé Apple", status: appleHealthStatus, symbol: "heart.text.square")
                sourceRow(title: "Google Health", status: "Configuration requise sur le site Soma", symbol: "globe")
                Link(destination: Self.settingsURL) {
                    Label("Ouvrir les réglages web", systemImage: "arrow.up.right.square")
                }
                .accessibilityHint("Ouvre le site sécurisé de Soma dans le navigateur")
            }
        }
    }

    private var navigation: some View {
        HStack {
            if step != .introduction {
                Button("Retour") { move(to: Step(rawValue: step.rawValue - 1) ?? .introduction) }
                    .buttonStyle(.bordered)
                    .frame(minHeight: 44)
            }
            Spacer()
            if step == .health {
                Button("Terminer") { Task { await finish(openHealth: false) } }
                    .buttonStyle(.borderedProminent)
                    .tint(SomaTheme.primary)
                    .foregroundStyle(SomaTheme.canvas)
                    .disabled(model.isSavingOnboarding)
                    .frame(minHeight: 44)
                #if os(iOS)
                Button("Terminer et vérifier Santé") { Task { await finish(openHealth: true) } }
                    .buttonStyle(.bordered)
                    .disabled(model.isSavingOnboarding)
                    .frame(minHeight: 44)
                #endif
            } else {
                Button("Continuer") { continueForward() }
                    .buttonStyle(.borderedProminent)
                    .tint(SomaTheme.primary)
                    .foregroundStyle(SomaTheme.canvas)
                    .frame(minHeight: 44)
            }
        }
    }

    private var wakeTimeBinding: Binding<Date> {
        Binding(
            get: { Calendar.current.date(from: draft.usualWakeTime) ?? .now },
            set: { draft.usualWakeTime = Calendar.current.dateComponents([.hour, .minute], from: $0) }
        )
    }

    private var appleHealthStatus: String {
        #if os(iOS)
        "Disponible sur cet iPhone · autorisation à vérifier"
        #else
        "Configuration requise dans l’app iPhone"
        #endif
    }

    private func continueForward() {
        validationMessage = nil
        if step == .introduction, !draft.profileIsValid {
            validationMessage = "Vérifie le nom, la date au format AAAA-MM-JJ, la taille et le poids."
            focusedField = .name
            return
        }
        move(to: Step(rawValue: step.rawValue + 1) ?? .health)
    }

    private func move(to newStep: Step) {
        validationMessage = nil
        step = newStep
        focusedField = .heading
    }

    private func finish(openHealth: Bool) async {
        guard let request = draft.request else {
            step = .introduction
            validationMessage = "Vérifie les informations personnelles avant de terminer."
            return
        }
        if await model.completeOnboarding(request) { onFinished(openHealth) }
    }

    private func sourceRow(title: String, status: String, symbol: String) -> some View {
        LabeledContent {
            Text(status)
                .foregroundStyle(SomaTheme.secondary)
                .multilineTextAlignment(.trailing)
        } label: {
            Label(title, systemImage: symbol)
        }
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
    }

    private static func sleepLabel(_ minutes: Int) -> String {
        "\(minutes / 60) h \((minutes % 60).formatted(.number.precision(.integerLength(2))))"
    }

    private static let settingsURL = URL(string: "https://soma-neon-phi.vercel.app/settings")!

    private enum Field: Hashable {
        case heading, name, birthDate, measurements
    }
}
