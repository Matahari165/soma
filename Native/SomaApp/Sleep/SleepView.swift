import SomaCore
import SwiftUI

struct SleepView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScreenScaffold(title: "Sommeil", context: "30 derniers jours") {
            if let sleep = model.sleep {
                SleepContentView(sleep: sleep)
            } else if model.isSleepLoading {
                ContentStateView(kind: .loading("Chargement du sommeil…"))
            } else if let error = model.sleepErrorMessage {
                ContentStateView(kind: .error(message: error, retry: {
                    Task { await model.refreshSleep() }
                }))
            } else {
                ContentStateView(kind: .empty(
                    title: "Sommeil non chargé",
                    detail: "Charge les nuits disponibles depuis Soma."
                ))
                Button("Charger le sommeil") { Task { await model.refreshSleep() } }
                    .buttonStyle(.bordered)
                    .frame(minHeight: 44)
            }
        }
        .task {
            if model.sleep == nil, !model.isSleepLoading {
                await model.refreshSleep()
            }
        }
    }
}
