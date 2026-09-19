import SomaCore
import SwiftUI

struct RecoveryView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScreenScaffold(title: "Récupération", context: "30 jours") {
            content
        }
        .task {
            if model.recovery == nil, !model.isRecoveryLoading {
                await model.refreshRecovery()
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let response = model.recovery {
            RecoveryContent(response: response)
        } else if model.isRecoveryLoading {
            RecoveryLoadingView()
        } else if let message = model.recoveryErrorMessage {
            ContentStateView(kind: .error(message: message, retry: {
                Task { await model.refreshRecovery() }
            }))
        } else {
            ContentStateView(kind: .empty(
                title: "Récupération indisponible",
                detail: "Aucune donnée de récupération n’a été reçue."
            ))
        }
    }
}

private struct RecoveryContent: View {
    @Environment(AppModel.self) private var model

    let response: NativeRecoveryResponse

    private var presentation: RecoveryPresentation { RecoveryPresentation(response: response) }

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 32) {
            DomainIndicatorBlock(data: presentation.indicator)
            if response.score.value == nil {
                RecoveryFactorsView(response: response)
            }
            RecoveryMetadataView(response: response, isRefreshing: model.isRecoveryLoading) {
                Task { await model.refreshRecovery() }
            }

            VStack(alignment: .leading, spacing: 16) {
                Text("Signaux récents")
                    .font(.title2)
                    .accessibilityAddTraits(.isHeader)
                RecoverySignalReferenceView(title: "VFC nocturne", signal: response.signals.hrv, higherIsBetter: true)
                Divider().overlay(SomaTheme.rule)
                RecoverySignalReferenceView(title: "Fréquence cardiaque au repos", signal: response.signals.restingHeartRate, higherIsBetter: false)
            }

            VStack(alignment: .leading, spacing: 16) {
                Text("Tendances")
                    .font(.title2)
                    .accessibilityAddTraits(.isHeader)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 32)], alignment: .leading, spacing: 32) {
                    TimeSeriesChart(data: presentation.hrvTrend)
                    TimeSeriesChart(data: presentation.restingHeartRateTrend)
                }
            }
        }
    }
}

private struct RecoveryLoadingView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            ProgressView("Chargement de la récupération…")
            Rectangle()
                .fill(SomaTheme.rule)
                .frame(maxWidth: .infinity, minHeight: 144)
                .accessibilityHidden(true)
            Rectangle()
                .fill(SomaTheme.rule)
                .frame(maxWidth: .infinity, minHeight: 220)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .contain)
    }
}
