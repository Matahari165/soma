import SwiftUI
import SomaCore

struct ExportView: View {
    @State private var model = ExportViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                header
                status
                actions
                if !model.completedFiles.isEmpty { files }
                futureRestoreNote
            }
            .frame(maxWidth: 760, alignment: .leading)
            .padding(.horizontal, 32)
            .padding(.vertical, 40)
        }
        .navigationTitle("Exporter mes données")
        .somaScreen()
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Exporter mes données")
                .font(.system(.largeTitle, design: .serif))
            Text("Soma crée un fichier JSON et télécharge séparément les archives de santé disponibles. Les fichiers restent sur cet appareil et ne sont transmis que lorsque tu choisis de les partager.")
                .font(.body)
                .foregroundStyle(SomaTheme.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var status: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch model.phase {
            case .idle:
                Label("Aucun export préparé", systemImage: "tray")
            case .preparing:
                Label("Préparation de l’export…", systemImage: "arrow.down.doc")
            case .downloadingArchive(let current, let total):
                Label("Téléchargement de l’archive \(current) sur \(total)…", systemImage: "archivebox")
            case .ready:
                Label("Export prêt", systemImage: "checkmark.circle")
                    .foregroundStyle(SomaTheme.signal)
            case .cancelled:
                Label("Téléchargement interrompu", systemImage: "pause.circle")
                    .foregroundStyle(SomaTheme.warning)
            case .failed(let message):
                Label(message, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(SomaTheme.warning)
            }

            if model.isTransferring {
                if let progress = model.progress {
                    ProgressView(value: progress) {
                        Text("Progression")
                    } currentValueLabel: {
                        Text(progress, format: .percent.precision(.fractionLength(0)))
                    }
                    .accessibilityValue(Text(progress, format: .percent.precision(.fractionLength(0))))
                } else {
                    ProgressView("Téléchargement des données…")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 16)
        .overlay(alignment: .bottom) { Rectangle().fill(SomaTheme.rule).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }

    private var actions: some View {
        HStack(spacing: 12) {
            if model.isTransferring {
                Button("Annuler", role: .cancel, action: model.cancel)
                    .buttonStyle(.bordered)
            } else {
                Button(actionTitle, systemImage: actionIcon, action: model.start)
                    .buttonStyle(.borderedProminent)
                    .tint(SomaTheme.primary)
                    .foregroundStyle(SomaTheme.canvas)
            }
        }
        .controlSize(.large)
    }

    private var files: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Fichiers disponibles")
                .font(.headline)
            ForEach(model.completedFiles) { file in
                HStack(spacing: 12) {
                    Image(systemName: file.url.pathExtension == "json" ? "doc.text" : "archivebox")
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(file.filename)
                            .fixedSize(horizontal: false, vertical: true)
                        if let byteCount = file.byteCount {
                            Text(byteCount, format: .byteCount(style: .file))
                                .font(.caption)
                                .foregroundStyle(SomaTheme.secondary)
                        }
                    }
                    Spacer(minLength: 8)
                    ShareLink(item: file.url) {
                        Label("Partager ou enregistrer", systemImage: "square.and.arrow.up")
                    }
                    .labelStyle(.iconOnly)
                    .accessibilityLabel("Partager ou enregistrer \(file.filename)")
                }
                .frame(minHeight: 44)
            }
        }
    }

    private var futureRestoreNote: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Restauration")
                .font(.headline)
            Text("Cet écran exporte uniquement une copie. Il ne remplace, ne fusionne et ne restaure aucune donnée dans Soma.")
                .foregroundStyle(SomaTheme.secondary)
        }
    }

    private var actionTitle: String {
        switch model.phase {
        case .cancelled, .failed: "Reprendre"
        case .ready: "Créer un nouvel export"
        default: "Créer l’export"
        }
    }

    private var actionIcon: String {
        switch model.phase {
        case .cancelled, .failed: "arrow.clockwise"
        default: "arrow.down.doc"
        }
    }
}
