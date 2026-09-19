import SomaCore
import SwiftUI

struct SleepContentView: View {
    let sleep: NativeSleepResponse

    var body: some View {
        if let latest = sleep.latestMeasuredDay {
            VStack(alignment: .leading, spacing: 32) {
                SleepSummaryView(day: latest, score: sleep.latestScore, timeZone: sleep.timezone)
                SleepHistoryView(response: sleep)
                SleepStagesView(day: latest)
                SleepEvidenceView(response: sleep, day: latest)
            }
        } else {
            ContentUnavailableView {
                Label("Aucune nuit mesurée", systemImage: "moon.zzz")
            } description: {
                Text("Aucune durée de sommeil n’est disponible sur les 30 derniers jours. Une absence reste distincte d’une durée de 0 minute.")
            }
        }
    }
}
