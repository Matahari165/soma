import SwiftUI
import SomaCore

struct HealthView: View {
    #if os(iOS)
    @State private var model = HealthViewModel()
    #endif

    var body: some View {
        #if os(iOS)
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                Text("Santé")
                    .font(.system(.largeTitle, design: .serif))
                statusSection
                if let snapshot = model.snapshot {
                    coverageSection(snapshot)
                    provenanceSection(snapshot)
                }
            }
            .padding(24)
            .frame(maxWidth: 920, alignment: .leading)
        }
        .refreshable { await model.retry() }
        .task { await model.loadAuthorizationState() }
        #else
        ContentUnavailableView(
            "HealthKit sur iPhone",
            systemImage: "heart.text.square",
            description: Text("L’accès aux données Santé est disponible dans l’app iPhone.")
        )
        #endif
    }

    #if os(iOS)
    @ViewBuilder
    private var statusSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Accès HealthKit")
                .font(.system(.title2, design: .serif))

            switch model.state {
            case .checking:
                ProgressView("Vérification de l’accès…")
            case .unavailable:
                statusText("HealthKit n’est pas disponible sur cet appareil.", symbol: "xmark.circle")
            case .authorizationNeeded:
                statusText("Soma demande uniquement un accès en lecture aux mesures utiles.", symbol: "lock.shield")
                primaryButton("Choisir les données à autoriser") {
                    await model.authorizeAndRead()
                }
            case .authorizationIndeterminate:
                statusText("L’état de la demande d’accès n’a pas pu être déterminé.", symbol: "questionmark.circle")
                primaryButton("Vérifier l’accès") {
                    await model.authorizeAndRead()
                }
            case .ready:
                statusText("Les choix d’accès ont déjà été enregistrés. HealthKit ne révèle pas à Soma les types refusés.", symbol: "checkmark.circle")
                primaryButton("Lire les 7 derniers jours") {
                    await model.retry()
                }
            case .loading:
                ProgressView("Lecture des données accessibles…")
            case .noAccessibleData:
                statusText("Aucune mesure accessible sur 7 jours. Il peut ne pas y avoir de donnée, ou l’accès peut ne pas avoir été accordé.", symbol: "minus.circle")
                secondaryButton("Réessayer") { await model.retry() }
            case .loaded:
                statusText(
                    model.snapshot?.isPartial == true
                        ? "Certaines mesures sont accessibles ; d’autres n’ont pas pu être lues."
                        : "Mesures accessibles lues sur les 7 derniers jours.",
                    symbol: model.snapshot?.isPartial == true ? "exclamationmark.circle" : "checkmark.circle"
                )
                secondaryButton("Actualiser") { await model.retry() }
            case .interrupted:
                statusText("La lecture a été interrompue. Aucune absence n’a été transformée en zéro.", symbol: "pause.circle")
                primaryButton("Reprendre") { await model.retry() }
            case .failed:
                statusText("Les données Santé n’ont pas pu être lues.", symbol: "exclamationmark.triangle")
                primaryButton("Réessayer") { await model.retry() }
            }
        }
    }

    private func coverageSection(_ snapshot: HealthSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Couverture")
                .font(.system(.title2, design: .serif))
            ForEach(snapshot.requestedMetrics, id: \.self) { metric in
                LabeledContent(metric.label) {
                    if snapshot.failedMetrics.contains(metric) {
                        Text("Indisponible")
                            .foregroundStyle(SomaTheme.warning)
                    } else if let count = snapshot.recordCountByMetric[metric] {
                        Text(count, format: .number)
                            .font(.system(.body, design: .monospaced))
                            .accessibilityLabel("\(count) mesures accessibles")
                    } else {
                        Text("—")
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(SomaTheme.secondary)
                            .accessibilityLabel("Aucune mesure accessible")
                    }
                }
                Divider().overlay(SomaTheme.rule)
            }
        }
    }

    private func provenanceSection(_ snapshot: HealthSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Provenance")
                .font(.system(.title2, design: .serif))
            LabeledContent("Données importées") {
                Text("Santé · HealthKit")
            }
            LabeledContent("Sources accessibles") {
                Text(snapshot.sourceNames.isEmpty ? "—" : snapshot.sourceNames.joined(separator: ", "))
                    .multilineTextAlignment(.trailing)
            }
            LabeledContent("Dernière mesure accessible") {
                if let date = snapshot.latestMeasurementDate {
                    Text(date, format: .dateTime.day().month().year().hour().minute())
                        .font(.system(.body, design: .monospaced))
                } else {
                    Text("—")
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(SomaTheme.secondary)
                        .accessibilityLabel("Aucune mesure accessible")
                }
            }
            LabeledContent("Métriques calculées par Soma") {
                Text("Aucune sur cet écran")
            }
            Text("Cette lecture reste locale. L’envoi au serveur natif attend un contrat compatible avec les sessions de l’app.")
                .foregroundStyle(SomaTheme.secondary)
        }
    }

    private func statusText(_ text: String, symbol: String) -> some View {
        Label(text, systemImage: symbol)
            .foregroundStyle(SomaTheme.secondary)
            .accessibilityElement(children: .combine)
    }

    private func primaryButton(_ title: String, action: @escaping @MainActor () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            Text(title)
                .foregroundStyle(SomaTheme.canvas)
        }
            .buttonStyle(.borderedProminent)
            .tint(SomaTheme.primary)
            .frame(minHeight: 44)
            .disabled(model.state == .loading)
    }

    private func secondaryButton(_ title: String, action: @escaping @MainActor () async -> Void) -> some View {
        Button(title) { Task { await action() } }
            .buttonStyle(.bordered)
            .tint(SomaTheme.primary)
            .frame(minHeight: 44)
            .disabled(model.state == .loading)
    }
    #endif
}

private extension HealthMetricIdentifier {
    var label: String {
        switch self {
        case .stepCount: "Pas"
        case .activeEnergyBurned: "Énergie active"
        case .heartRateVariabilitySDNN: "VFC (SDNN)"
        case .restingHeartRate: "Fréquence cardiaque au repos"
        case .respiratoryRate: "Fréquence respiratoire"
        case .oxygenSaturation: "Saturation en oxygène"
        case .sleepAnalysis: "Sommeil"
        }
    }
}
