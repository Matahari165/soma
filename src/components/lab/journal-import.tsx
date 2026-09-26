"use client";

import { LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";

type Conflict = {
  key: string;
  date: string;
  sourceHabitName: string;
  sourceValue: boolean | number;
  normalizedSourceValue: boolean | number | string;
  somaHabitName: string;
  somaValue: boolean | number | string;
  somaUnit: string | null;
  reason: string;
};

type Preview = {
  dateRange: { from: string | null; to: string | null };
  importedDates: number;
  conflicts: Conflict[];
  unknownHeaders: string[];
  newVariableNames: string[];
  stats: { sourceRows: number; sourceCells: number; writeCells: number; omittedCells: number; unchangedCells: number; preservedSomaCells: number; skippedPrecisionCells: number; skippedAutomaticBlankCells: number; conflictCells: number };
  metrics: Array<{ key: string; sourceLabel: string; variableName: string; target: string | null; action: string; captureMode: string; trackingCadence: string }>;
};

function displayValue(value: boolean | number | string) {
  if (typeof value === "boolean") return value ? "1 / oui" : "0 / non";
  return String(value);
}

function parsePreview(value: unknown): Preview | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Preview>;
  return Array.isArray(candidate.conflicts) && candidate.stats && Array.isArray(candidate.metrics) ? candidate as Preview : null;
}

export function JournalImportPage() {
  const [sourceText, setSourceText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "keep_soma" | "use_sheet">>({});
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "neutral"; text: string } | null>(null);

  const unresolvedCount = useMemo(() => preview?.conflicts.filter((conflict) => !resolutions[conflict.key]).length ?? 0, [preview, resolutions]);
  const canCommit = Boolean(preview && unresolvedCount === 0 && !busy);

  async function submit(mode: "preview" | "commit") {
    setBusy(mode);
    setMessage(null);
    try {
      const source = JSON.parse(sourceText) as unknown;
      const response = await fetch("/api/lab/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, source, resolutions: Object.entries(resolutions).map(([key, action]) => ({ key, action })) }),
      });
      const result = await response.json().catch(() => null);
      const nextPreview = parsePreview(result);
      if (nextPreview) setPreview(nextPreview);
      if (!response.ok) throw new Error(result?.error ?? "L’import n’a pas pu être terminé.");
      setMessage({ tone: mode === "commit" ? "success" : "neutral", text: mode === "commit" ? `Import terminé : ${result.importedDates} journée(s) traitée(s).` : "Aperçu prêt. Rien n’a encore été écrit." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof SyntaxError ? "Le contenu doit être un JSON valide." : error instanceof Error ? error.message : "L’import n’a pas pu être terminé." });
    } finally {
      setBusy(null);
    }
  }

  return <div className="settings-page" id="main-page-content">
    <header>
      <h1>Journal import</h1>
      <p>Importe l’historique de l’onglet Goose sans remplacer les valeurs déjà présentes dans Soma.</p>
    </header>
    <div className="settings-layout">
      <aside aria-label="Import rules">
        <p>Source unique</p>
        <p>Goose uniquement</p>
        <p>Blanc ≠ zéro</p>
      </aside>
      <main className="settings-content">
        <section className="settings-card" aria-labelledby="journal-import-title">
          <div>
            <h2 id="journal-import-title">Historique Google Sheets</h2>
            <p>Colle le JSON normalisé de la deuxième feuille <code>Goose</code>. Le premier bouton compare les deux historiques ; le second écrit seulement après validation des éventuels conflits.</p>
          </div>
          <label className="field" htmlFor="journal-import-source"><span>Données de Goose</span><textarea id="journal-import-source" rows={16} spellCheck={false} value={sourceText} onChange={(event) => { setSourceText(event.target.value); setPreview(null); }} placeholder={'{"spreadsheetId":"…","sheetName":"Goose","headers":[…],"targets":[…],"rows":[…]}'} /></label>
          <div className="settings-message" role="note"><strong>Règles appliquées</strong><p>Breakfast suit la sémantique existante de Soma. WHM conserve uniquement les rounds déjà enregistrés dans Soma ; un 1 de la feuille ne devient jamais 1 round.</p></div>
          <div className="connection-actions">
            <button className="primary-button" type="button" disabled={!sourceText.trim() || Boolean(busy)} onClick={() => void submit("preview")}>{busy === "preview" ? <><LoaderCircle className="spin" aria-hidden="true" />Analyse…</> : "Prévisualiser"}</button>
            <button className="secondary-button" type="button" disabled={!canCommit} onClick={() => void submit("commit")}>{busy === "commit" ? <><LoaderCircle className="spin" aria-hidden="true" />Import…</> : "Importer l’historique"}</button>
          </div>
          {message && <p className={`settings-message settings-message--${message.tone} soma-motion-state`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}
        </section>

        {preview && <section className="settings-card soma-motion-state" aria-labelledby="journal-import-preview-title">
          <div>
            <h2 id="journal-import-preview-title">Aperçu</h2>
            <p>{preview.dateRange.from ?? "—"} → {preview.dateRange.to ?? "—"} · {preview.stats.sourceRows} lignes · {preview.stats.sourceCells} valeurs renseignées</p>
          </div>
          <dl>
            <div><dt>À écrire</dt><dd>{preview.stats.writeCells}</dd></div>
            <div><dt>À laisser vide</dt><dd>{preview.stats.omittedCells}</dd></div>
            <div><dt>Déjà dans Soma</dt><dd>{preview.stats.unchangedCells + preview.stats.preservedSomaCells}</dd></div>
            <div><dt>WHM non converti</dt><dd>{preview.stats.skippedPrecisionCells}</dd></div>
          </dl>
          {preview.newVariableNames.length > 0 && <p className="settings-message">Nouvelles métriques créées : {preview.newVariableNames.join(", ")}.</p>}
          {preview.unknownHeaders.length > 0 && <p className="form-error" role="alert">Colonnes ignorées : {preview.unknownHeaders.join(", ")}.</p>}
          <div className="import-mapping" aria-label="Mapping des métriques">
            <h3>Métriques</h3>
            <ul>{preview.metrics.map((metric) => <li key={metric.key}><strong>{metric.sourceLabel}</strong><span>→ {metric.variableName} · {metric.captureMode === "automatic" ? "Google Health" : "manuel"} · {metric.trackingCadence === "weekly" ? "hebdomadaire" : "quotidien"}</span></li>)}</ul>
          </div>
          {preview.conflicts.length > 0 ? <div className="import-conflicts">
            <h3>Conflits à décider</h3>
            <p>Un conflit affiche les deux habitudes et les deux valeurs. Choisis la source à conserver pour chaque ligne.</p>
            <div role="region" aria-label="Conflits d’import" tabIndex={0}>
              <table>
                <thead><tr><th>Date</th><th>Google Sheets</th><th>Soma</th><th>Source</th></tr></thead>
                <tbody>{preview.conflicts.map((conflict) => <tr key={conflict.key}>
                  <th scope="row">{conflict.date}</th>
                  <td>{conflict.sourceHabitName} · {displayValue(conflict.normalizedSourceValue)}</td>
                  <td>{conflict.somaHabitName} · {displayValue(conflict.somaValue)}{conflict.somaUnit ? ` ${conflict.somaUnit}` : ""}</td>
                  <td><label><span className="sr-only">Source pour {conflict.date} {conflict.sourceHabitName}</span><select value={resolutions[conflict.key] ?? ""} onChange={(event) => setResolutions((current) => ({ ...current, [conflict.key]: event.target.value as "keep_soma" | "use_sheet" }))}><option value="">Choisir…</option><option value="keep_soma">Garder Soma</option><option value="use_sheet">Utiliser Google Sheets</option></select></label></td>
                </tr>)}</tbody>
              </table>
            </div>
            {unresolvedCount > 0 && <p className="form-error" role="alert">{unresolvedCount} conflit(s) doivent encore être décidé(s).</p>}
          </div> : <p className="settings-message settings-message--success">Aucun conflit restant. L’import peut être lancé.</p>}
        </section>}
      </main>
    </div>
  </div>;
}
