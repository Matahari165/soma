"use client";

import { ImagePlus, LoaderCircle, ScanLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  journalAutomaticSource,
  journalAutomaticSources,
  journalDayPeriods,
  journalDraftsForDates,
  journalEntriesForSave,
  journalValuesForDate,
  dinnerTimeForDisplay,
  isDinnerTimeVariable,
  normalizeDinnerTimeInput,
  reconcileJournalDrafts,
  journalVariableSuggestions,
  updateJournalDraft,
  type JournalCaptureMode,
  type JournalDraftsByDate,
  type JournalEntry,
  type JournalEntryValue,
  type JournalDay,
  type JournalDayPeriod,
  type JournalVariable,
  type JournalVariableType,
  type JournalTrackingCadence,
} from "@/domain/lab/journal";
import type { JournalAchievement } from "@/domain/lab/journal-achievement";

import { localizedMetricLabel, localizedMetricUnit } from "./lab-copy";

type DraftValue = JournalEntryValue | null;
type NewVariable = { name: string; variableType: JournalVariableType; unit: string; options: string; emoji: string; dayPeriod: JournalDayPeriod; defaultValue: string; captureMode: JournalCaptureMode; automaticMetricId: string | null; trackingCadence: JournalTrackingCadence };

const typeLabels: Record<JournalVariableType, string> = {
  boolean: "Oui / non",
  count: "Compteur",
  duration: "Durée",
  number: "Nombre",
  scale: "Échelle 1–5",
  category: "Catégorie",
  time: "Heure",
};

const dayPeriodLabels: Record<JournalDayPeriod, string> = {
  context: "Contexte de la journée",
  morning: "Matin",
  day: "Journée",
  evening: "Soirée",
  sleep: "Avant le sommeil",
  other: "Autre",
};

function journalVariableKey(name: string) {
  return name.trim().toLocaleLowerCase("en");
}

function journalVariableLabel(variable: Pick<JournalVariable, "name"> | Pick<NewVariable, "name">) {
  return localizedMetricLabel(`journal:${variable.name}`, variable.name);
}

function journalVariableUnit(variable: Pick<JournalVariable, "unit">) {
  if (!variable.unit) return variable.unit;
  return localizedMetricUnit(variable.unit);
}

function journalVariableDefaultValue(variable: Pick<JournalVariable, "defaultValue">) {
  if (variable.defaultValue === true) return "Oui";
  if (variable.defaultValue === false) return "Non";
  return variable.defaultValue === null ? "" : String(variable.defaultValue);
}

function dayPeriodLabel(period: JournalDayPeriod) {
  return dayPeriodLabels[period];
}

const journalDisplayOrder: JournalDayPeriod[] = ["morning", "day", "evening", "context", "other"];
const editableJournalDayPeriods = journalDayPeriods.filter((period) => period.id !== "sleep");

const numericTypes = new Set<JournalVariableType>(["count", "duration", "number", "scale"]);
const textNumericTypes = new Set<JournalVariableType>(["count", "duration", "number"]);
type JournalSaveStatus = "draft" | "saving" | "saved" | "error";

export function journalStatusText({ validated, validating, saveStatus }: { validated: boolean; validating: boolean; saveStatus: JournalSaveStatus }) {
  if (validating) return "Validation…";
  if (saveStatus === "saving") return "Enregistrement…";
  if (saveStatus === "error") return "Échec de l’enregistrement";
  if (validated) return "Journée validée";
  if (saveStatus === "saved") return "Brouillon sauvegardé";
  return "Brouillon";
}

function splitOptions(value: string) {
  return value.split(",").map((option) => option.trim()).filter(Boolean);
}

function displayedDayPeriod(variable: JournalVariable) {
  if (journalVariableKey(variable.name) === "magnesium") return "morning";
  return variable.dayPeriod === "sleep" ? "evening" : variable.dayPeriod;
}

function suggestionDraft(suggestion: (typeof journalVariableSuggestions)[number]): NewVariable {
  return {
    name: suggestion.name,
    variableType: suggestion.variableType,
    unit: suggestion.unit ?? "",
    options: suggestion.options.join(", "),
    emoji: "🧪",
    dayPeriod: "day",
    defaultValue: suggestion.variableType === "boolean" ? "false" : "0",
    captureMode: "manual",
    automaticMetricId: null,
    trackingCadence: "daily",
  };
}

function DinnerTimeInput({ inputId, value, disabled, onChange }: { inputId: string; value: DraftValue; disabled: boolean; onChange: (value: DraftValue) => void }) {
  const canonicalValue = typeof value === "string" ? value : "";
  const [displayHour = "", displayMinute = ""] = dinnerTimeForDisplay(canonicalValue).split(":");
  const [hour, setHour] = useState(displayHour);
  const [minute, setMinute] = useState(displayMinute);
  const [invalid, setInvalid] = useState(false);
  const minuteRef = useRef<HTMLInputElement>(null);

  function commit() {
    if (!hour && !minute) {
      setInvalid(false);
      onChange(null);
      return;
    }
    const normalized = normalizeDinnerTimeInput(`${hour}:${minute}`);
    if (!normalized) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const [nextHour, nextMinute] = dinnerTimeForDisplay(normalized).split(":");
    setHour(nextHour);
    setMinute(nextMinute);
    onChange(normalized);
  }

  function digits(value: string, maximumLength: number) {
    return value.replace(/\D/g, "").slice(0, maximumLength);
  }

  return <div className={`journal-clock${invalid ? " journal-clock--invalid" : ""}`} id={inputId} role="group" aria-label="Heure de fin du dîner" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit();
  }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }}>
    <input disabled={disabled} aria-label="Heure de fin du dîner" aria-invalid={invalid} inputMode="numeric" autoComplete="off" placeholder="HH" type="text" value={hour} onChange={(event) => {
      const next = digits(event.target.value, 2);
      setHour(next);
      setInvalid(false);
      if (next.length === 2) minuteRef.current?.focus();
    }} />
    <span aria-hidden="true">:</span>
    <input ref={minuteRef} disabled={disabled} aria-label="Minutes de fin du dîner" aria-invalid={invalid} inputMode="numeric" autoComplete="off" placeholder="MM" type="text" value={minute} onChange={(event) => { setMinute(digits(event.target.value, 2)); setInvalid(false); }} />
  </div>;
}

function Field({ variable, value, draftKey, onChange, onCommit, disabled = false, presentation = "default" }: { variable: JournalVariable; value: DraftValue; draftKey: string; onChange: (value: DraftValue) => void; onCommit?: () => void; disabled?: boolean; presentation?: "default" | "personal-lab" }) {
  const inputId = `journal-${variable.id}`;

  if (variable.variableType === "boolean") {
    const options = [{ label: "Non", value: false }, { label: "Oui", value: true }];
    return <div className={`journal-choice${presentation === "personal-lab" ? " journal-choice--binary" : ""}`} role="group" aria-label={journalVariableLabel(variable)}>
      {options.map((option) => <button type="button" disabled={disabled} className={value === option.value ? "is-selected" : ""} aria-pressed={value === option.value} onClick={() => onChange(option.value)} key={option.label}>{option.label}</button>)}
    </div>;
  }

  if (variable.variableType === "scale") {
    return <div className="journal-choice journal-choice--scale" role="group" aria-label={`${journalVariableLabel(variable)}, de 1 à 5`}>
      {[1, 2, 3, 4, 5].map((option) => <button type="button" disabled={disabled} className={value === option ? "is-selected" : ""} aria-pressed={value === option} onClick={() => onChange(value === option ? null : option)} key={option}>{option}</button>)}
    </div>;
  }

  if (variable.variableType === "category") {
    return <select disabled={disabled} id={inputId} aria-label={journalVariableLabel(variable)} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">Non renseigné</option>
      {variable.options.map((option) => <option value={option} key={option}>{option}</option>)}
    </select>;
  }

  if (variable.variableType === "time") {
    if (isDinnerTimeVariable(variable)) return <DinnerTimeInput key={draftKey} inputId={inputId} value={value} disabled={disabled} onChange={onChange} />;
    return <input disabled={disabled} id={inputId} aria-label={journalVariableLabel(variable)} type="time" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />;
  }

  const nonNegative = variable.variableType === "count" || variable.variableType === "duration" || ["caffeine", "added sugar", "magnesium"].includes(journalVariableKey(variable.name));
  const input = <input disabled={disabled} id={inputId} aria-label={journalVariableLabel(variable)} type="number" min={nonNegative ? 0 : undefined} step={variable.variableType === "count" ? 1 : "any"} placeholder="—" value={typeof value === "number" || typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} onBlur={onCommit} />;
  if (presentation !== "personal-lab") return <div className="journal-number">{input}<span>{journalVariableUnit(variable)}</span></div>;

  function adjustValue(direction: -1 | 1) {
    const numericValue = typeof value === "number" ? value : Number(value);
    const baseValue = Number.isFinite(numericValue) ? numericValue : 0;
    const nextValue = baseValue + direction;
    onChange(nonNegative ? Math.max(0, nextValue) : nextValue);
  }

  return <div className="journal-number journal-number--stepper">
    <button type="button" disabled={disabled} aria-label={`Diminuer ${journalVariableLabel(variable)}`} aria-controls={inputId} onClick={() => adjustValue(-1)}>−</button>
    <span className="journal-number__value">{input}<span>{journalVariableUnit(variable)}</span></span>
    <button type="button" disabled={disabled} aria-label={`Augmenter ${journalVariableLabel(variable)}`} aria-controls={inputId} onClick={() => adjustValue(1)}>+</button>
  </div>;
}

function VariableEditor({ variableType, name, unit, options, emoji, dayPeriod, defaultValue, captureMode, automaticMetricId, trackingCadence, busy, onNameChange, onTypeChange, onUnitChange, onOptionsChange, onEmojiChange, onDayPeriodChange, onDefaultValueChange, onCaptureModeChange, onAutomaticMetricChange, onTrackingCadenceChange, onSave, onCancel }: {
  variableType: JournalVariableType;
  name: string;
  unit: string;
  options: string;
  emoji: string;
  dayPeriod: JournalDayPeriod;
  defaultValue: string;
  captureMode: JournalCaptureMode;
  automaticMetricId: string | null;
  trackingCadence: JournalTrackingCadence;
  busy: boolean;
  onNameChange: (value: string) => void;
  onTypeChange: (value: JournalVariableType) => void;
  onUnitChange: (value: string) => void;
  onOptionsChange: (value: string) => void;
  onEmojiChange: (value: string) => void;
  onDayPeriodChange: (value: JournalDayPeriod) => void;
  onDefaultValueChange: (value: string) => void;
  onCaptureModeChange: (value: JournalCaptureMode) => void;
  onAutomaticMetricChange: (value: string | null) => void;
  onTrackingCadenceChange: (value: JournalTrackingCadence) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return <div className="journal-variable-edit">
    <label>
      <span>Nom</span>
      <input aria-label="Nom de la mesure" value={name} onChange={(event) => onNameChange(event.target.value)} />
    </label>
    <label><span>Émoji</span><input aria-label="Émoji de la mesure" maxLength={8} value={emoji} onChange={(event) => onEmojiChange(event.target.value)} /></label>
    <label><span>Type</span><select disabled={captureMode === "automatic" && automaticMetricId !== null} aria-label="Type de mesure" value={variableType} onChange={(event) => onTypeChange(event.target.value as JournalVariableType)}>{Object.entries(typeLabels).filter(([value]) => ["boolean", "number", "count", "time", "scale", variableType].includes(value)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <label><span>Capture</span><select aria-label="Source de la mesure" value={captureMode} onChange={(event) => onCaptureModeChange(event.target.value as JournalCaptureMode)}><option value="manual">Manuelle</option><option value="automatic">Google Health</option></select></label>
    {captureMode === "automatic" && <label><span>Signal de santé</span><select aria-label="Signal de santé automatique" value={automaticMetricId ?? ""} onChange={(event) => onAutomaticMetricChange(event.target.value || null)}><option value="">Choisir un signal</option>{journalAutomaticSources.map((source) => <option value={source.id} key={source.id}>{source.label}</option>)}</select></label>}
    <label><span>Cadence cible</span><select aria-label="Cadence de la mesure" value={trackingCadence} onChange={(event) => onTrackingCadenceChange(event.target.value as JournalTrackingCadence)}><option value="daily">Chaque jour</option><option value="weekly">Une fois par semaine</option></select></label>
    <label><span>Moment</span><select disabled={captureMode === "automatic" && automaticMetricId !== null} aria-label="Moment de la mesure" value={dayPeriod === "sleep" ? "evening" : dayPeriod} onChange={(event) => onDayPeriodChange(event.target.value as JournalDayPeriod)}>{editableJournalDayPeriods.map((period) => <option value={period.id} key={period.id}>{dayPeriodLabel(period.id)}</option>)}</select></label>
    {numericTypes.has(variableType) && <label>
      <span>Unité <em>(facultative)</em></span>
      <input aria-label="Unité facultative" placeholder="Facultatif" value={unit} onChange={(event) => onUnitChange(event.target.value)} />
    </label>}
    {variableType === "category" && <label>
      <span>Choix</span>
      <input aria-label="Choix séparés par des virgules" placeholder="ex. Maison, Bureau" value={options} onChange={(event) => onOptionsChange(event.target.value)} />
    </label>}
    {variableType === "boolean" ? <label><span>Valeur par défaut</span><select aria-label="Valeur par défaut de la mesure" value={defaultValue} onChange={(event) => onDefaultValueChange(event.target.value)}><option value="">Non renseigné</option><option value="false">Non</option><option value="true">Oui</option></select></label> : variableType !== "category" && <label><span>Valeur par défaut</span><input aria-label="Valeur par défaut de la mesure" type={variableType === "time" ? "time" : "number"} value={defaultValue} onChange={(event) => onDefaultValueChange(event.target.value)} /></label>}
    <div className="journal-variable-edit__actions">
      <button type="button" onClick={onSave} disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Enregistrer</button>
      <button type="button" onClick={onCancel}>Annuler</button>
    </div>
  </div>;
}

function VariableManager({ variables, open, onClose }: { variables: JournalVariable[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editVariableType, setEditVariableType] = useState<JournalVariableType>("boolean");
  const [editUnit, setEditUnit] = useState("");
  const [editOptions, setEditOptions] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editDayPeriod, setEditDayPeriod] = useState<JournalDayPeriod>("day");
  const [editDefaultValue, setEditDefaultValue] = useState("");
  const [editCaptureMode, setEditCaptureMode] = useState<JournalCaptureMode>("manual");
  const [editAutomaticMetricId, setEditAutomaticMetricId] = useState<string | null>(null);
  const [editTrackingCadence, setEditTrackingCadence] = useState<JournalTrackingCadence>("daily");
  const [draft, setDraft] = useState<NewVariable>({ name: "", variableType: "boolean", unit: "", options: "", emoji: "🧪", dayPeriod: "day", defaultValue: "false", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily" });
  const [error, setError] = useState<string | null>(null);
  const activeVariables = variables.filter((variable) => variable.isActive);
  const activeNames = new Set(activeVariables.map((variable) => variable.name.toLocaleLowerCase("en")));
  const suggestions = journalVariableSuggestions.filter((suggestion) => !activeNames.has(suggestion.name.toLocaleLowerCase("en")));

  async function request(method: "POST" | "PATCH", body: unknown, busy: string) {
    setBusyId(busy);
    setError(null);
    try {
      const response = await fetch("/api/lab/variables", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Cette mesure n’a pas pu être enregistrée.");
      router.refresh();
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Cette mesure n’a pas pu être enregistrée.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function create() {
    const options = draft.variableType === "category" ? splitOptions(draft.options) : [];
    const defaultValue = draft.captureMode === "automatic" || draft.defaultValue === "" ? null : draft.variableType === "boolean" ? draft.defaultValue === "true" : draft.variableType === "time" ? draft.defaultValue : Number(draft.defaultValue);
    const ok = await request("POST", { name: draft.name, variableType: draft.variableType, unit: numericTypes.has(draft.variableType) ? draft.unit || null : null, options, emoji: draft.emoji || "🧪", dayPeriod: draft.dayPeriod, defaultValue, captureMode: draft.captureMode, automaticMetricId: draft.automaticMetricId, trackingCadence: draft.trackingCadence }, "new");
    if (ok) {
      setDraft({ name: "", variableType: "boolean", unit: "", options: "", emoji: "🧪", dayPeriod: "day", defaultValue: "false", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily" });
      setCreating(false);
    }
  }

  function startEdit(variable: JournalVariable) {
    setEditingId(variable.id);
    setEditName(variable.name);
    setEditVariableType(variable.variableType);
    setEditUnit(variable.unit ?? "");
    setEditOptions(variable.options.join(", "));
    setEditEmoji(variable.emoji);
    setEditDayPeriod(displayedDayPeriod(variable));
    setEditDefaultValue(variable.defaultValue === null ? "" : String(variable.defaultValue));
    setEditCaptureMode(variable.captureMode === "automatic" ? "automatic" : "manual");
    setEditAutomaticMetricId(typeof variable.automaticMetricId === "string" ? variable.automaticMetricId : null);
    setEditTrackingCadence(variable.trackingCadence ?? journalAutomaticSource(variable.automaticMetricId)?.defaultTrackingCadence ?? "daily");
    setError(null);
  }

  async function saveEdit(variable: JournalVariable) {
    const defaultValue = editCaptureMode === "automatic" || editDefaultValue === "" ? null : editVariableType === "boolean" ? editDefaultValue === "true" : editVariableType === "time" || editVariableType === "category" ? editDefaultValue : Number(editDefaultValue);
    const ok = await request("PATCH", { id: variable.id, name: editName, ...(editVariableType !== variable.variableType ? { variableType: editVariableType } : {}), emoji: editEmoji || "🧪", dayPeriod: editDayPeriod, defaultValue, unit: numericTypes.has(editVariableType) ? editUnit || null : null, ...(editVariableType === "category" ? { options: splitOptions(editOptions) } : {}), captureMode: editCaptureMode, automaticMetricId: editCaptureMode === "automatic" ? editAutomaticMetricId : null, trackingCadence: editTrackingCadence }, variable.id);
    if (ok) setEditingId(null);
  }

  const categoryOptions = splitOptions(draft.options);
  const canCreate = draft.name.trim().length > 0
    && (draft.variableType !== "category" || categoryOptions.length >= 2)
    && (draft.captureMode !== "automatic" || draft.automaticMetricId !== null);

  if (!open) return null;

  return <section className="journal-manager" aria-labelledby="journal-manager-title">
    <div className="journal-manager__header">
      <div>
        <h3 id="journal-manager-title">Champs du journal</h3>
        <p>Ajoute les habitudes ou le contexte que tu veux comparer à tes données de santé.</p>
      </div>
      <div className="journal-manager__header-actions">
        {!creating && <button className="secondary-button" type="button" onClick={() => { setCreating(true); setError(null); }}>Ajouter une mesure</button>}
        <button className="text-link" type="button" onClick={() => { onClose(); setCreating(false); setEditingId(null); }}>Terminé</button>
      </div>
    </div>

    <div className="journal-manager__body">
      {!creating && suggestions.length > 0 && <div className="journal-suggestions" aria-label="Mesures suggérées">
        {suggestions.map((suggestion) => <button type="button" key={suggestion.name} onClick={() => {
          setDraft(suggestionDraft(suggestion));
          setCreating(true);
          setError(null);
        }}><strong>{journalVariableLabel(suggestion)}</strong><span>{suggestion.unit ?? typeLabels[suggestion.variableType]}</span></button>)}
      </div>}
      <div className="journal-variable-list" aria-live="polite">
        {activeVariables.length === 0 && <p className="journal-manager__empty">Aucune mesure pour le moment.</p>}
        {activeVariables.map((variable) => editingId === variable.id ? <VariableEditor key={variable.id} variableType={editVariableType} name={editName} unit={editUnit} options={editOptions} emoji={editEmoji} dayPeriod={editDayPeriod} defaultValue={editDefaultValue} captureMode={editCaptureMode} automaticMetricId={editAutomaticMetricId} trackingCadence={editTrackingCadence} busy={busyId === variable.id} onNameChange={setEditName} onTypeChange={(value) => { setEditVariableType(value); setEditDefaultValue(value === "boolean" ? "false" : value === "time" || value === "scale" ? "" : "0"); }} onUnitChange={setEditUnit} onOptionsChange={setEditOptions} onEmojiChange={setEditEmoji} onDayPeriodChange={setEditDayPeriod} onDefaultValueChange={setEditDefaultValue} onCaptureModeChange={(value) => { setEditCaptureMode(value); if (value === "manual") setEditAutomaticMetricId(null); }} onAutomaticMetricChange={(value) => { setEditAutomaticMetricId(value); const source = journalAutomaticSource(value); if (source) { setEditVariableType(source.variableType); setEditDayPeriod(source.dayPeriod); setEditTrackingCadence(source.defaultTrackingCadence); setEditDefaultValue(""); } }} onTrackingCadenceChange={setEditTrackingCadence} onSave={() => void saveEdit(variable)} onCancel={() => setEditingId(null)} /> : <div className="journal-variable-row" key={variable.id}>
          <span><strong>{variable.emoji} {journalVariableLabel(variable)}</strong><small>{typeLabels[variable.variableType]}{journalVariableUnit(variable) ? ` · ${journalVariableUnit(variable)}` : ""} · {dayPeriodLabel(displayedDayPeriod(variable))}{variable.captureMode === "automatic" ? ` · ${journalAutomaticSource(variable.automaticMetricId)?.label ?? "Google Health"}` : ""}{variable.trackingCadence === "weekly" ? " · une fois par semaine" : ""}{variable.defaultValue !== null ? ` · valeur par défaut : ${journalVariableDefaultValue(variable)}` : ""}</small></span>
          <button type="button" aria-label={`Déplacer ${journalVariableLabel(variable)} plus tôt`} disabled={busyId === variable.id} onClick={() => void request("PATCH", { id: variable.id, position: Math.max(0, variable.position - 15) }, variable.id)}>↑</button>
          <button type="button" aria-label={`Déplacer ${journalVariableLabel(variable)} plus tard`} disabled={busyId === variable.id} onClick={() => void request("PATCH", { id: variable.id, position: variable.position + 15 }, variable.id)}>↓</button>
          <button type="button" onClick={() => startEdit(variable)}>Modifier</button>
          <button type="button" disabled={busyId === variable.id} title={`Retirer ${journalVariableLabel(variable)} du journal quotidien`} onClick={() => void request("PATCH", { id: variable.id, isActive: false }, variable.id)}>{busyId === variable.id ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Retirer</button>
        </div>)}
      </div>

      {creating && <div className="journal-new-variable">
        <div className="journal-new-variable__heading"><h4>Ajouter une mesure suivie</h4><p>Laisse-la vide les jours où tu ne veux rien noter : l’absence restera une absence.</p></div>
        <label><span>Nom</span><input placeholder="ex. Alcool, Vacances, Travail concentré" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span>Émoji</span><input aria-label="Émoji" maxLength={8} value={draft.emoji} onChange={(event) => setDraft((current) => ({ ...current, emoji: event.target.value }))} /></label>
        <label><span>Capture</span><select aria-label="Source de la mesure" value={draft.captureMode} onChange={(event) => {
          const captureMode = event.target.value as JournalCaptureMode;
          setDraft((current) => ({ ...current, captureMode, automaticMetricId: captureMode === "manual" ? null : current.automaticMetricId, defaultValue: captureMode === "automatic" ? "" : current.defaultValue }));
        }}><option value="manual">Manuelle</option><option value="automatic">Google Health</option></select></label>
        {draft.captureMode === "automatic" && <label><span>Signal de santé</span><select aria-label="Signal de santé automatique" value={draft.automaticMetricId ?? ""} onChange={(event) => {
          const automaticMetricId = event.target.value || null;
          const source = journalAutomaticSource(automaticMetricId);
          setDraft((current) => ({ ...current, automaticMetricId, variableType: source?.variableType ?? current.variableType, dayPeriod: source?.dayPeriod ?? current.dayPeriod, trackingCadence: source?.defaultTrackingCadence ?? current.trackingCadence, defaultValue: source ? "" : current.defaultValue }));
        }}><option value="">Choisir un signal</option>{journalAutomaticSources.map((source) => <option value={source.id} key={source.id}>{source.label}</option>)}</select></label>}
        <label><span>Cadence cible</span><select aria-label="Cadence de la mesure" value={draft.trackingCadence} onChange={(event) => setDraft((current) => ({ ...current, trackingCadence: event.target.value as JournalTrackingCadence }))}><option value="daily">Chaque jour</option><option value="weekly">Une fois par semaine</option></select></label>
        <label><span>Type de mesure</span><select disabled={draft.captureMode === "automatic" && draft.automaticMetricId !== null} aria-label="Type de mesure" value={draft.variableType} onChange={(event) => {
          const variableType = event.target.value as JournalVariableType;
          setDraft((current) => ({ ...current, variableType, defaultValue: variableType === "boolean" ? "false" : variableType === "time" || variableType === "scale" ? "" : "0" }));
        }}>{Object.entries(typeLabels).filter(([value]) => ["boolean", "number", "count", "time", "scale"].includes(value)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Moment</span><select disabled={draft.captureMode === "automatic" && draft.automaticMetricId !== null} aria-label="Moment de la mesure" value={draft.dayPeriod} onChange={(event) => setDraft((current) => ({ ...current, dayPeriod: event.target.value as JournalDayPeriod }))}>{editableJournalDayPeriods.map((period) => <option value={period.id} key={period.id}>{dayPeriodLabel(period.id)}</option>)}</select></label>
        {draft.captureMode === "automatic" ? <p className="journal-manager__hint">{journalAutomaticSource(draft.automaticMetricId)?.source ?? "La source"} préremplit cette métrique quand la donnée est disponible. Tu peux encore la corriger dans le journal.</p> : draft.variableType === "boolean" ? <label><span>Valeur par défaut</span><select aria-label="Valeur par défaut" value={draft.defaultValue} onChange={(event) => setDraft((current) => ({ ...current, defaultValue: event.target.value }))}><option value="">Non renseigné</option><option value="false">Non</option><option value="true">Oui</option></select></label> : <label><span>Valeur par défaut</span><input aria-label="Valeur par défaut" type={draft.variableType === "time" ? "time" : "number"} value={draft.defaultValue} onChange={(event) => setDraft((current) => ({ ...current, defaultValue: event.target.value }))} /></label>}
        {numericTypes.has(draft.variableType) && <label><span>Unité <em>(facultative)</em></span><input placeholder="ex. mg, min, verres" value={draft.unit} onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))} /></label>}
        {draft.variableType === "category" && <label><span>Choix <em>(au moins deux)</em></span><input placeholder="ex. Maison, Bureau, Vacances" value={draft.options} onChange={(event) => setDraft((current) => ({ ...current, options: event.target.value }))} /></label>}
        {draft.variableType === "category" && categoryOptions.length < 2 && <p className="journal-manager__hint">Ajoute au moins deux choix séparés par des virgules.</p>}
        <div className="journal-new-variable__actions"><button className="primary-button" type="button" disabled={!canCreate || busyId === "new"} onClick={() => void create()}>{busyId === "new" ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Ajouter la mesure</button><button className="text-link" type="button" onClick={() => setCreating(false)}>Annuler</button></div>
      </div>}

      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </section>;
}

function JournalFieldRow({ variable, value, draftKey, confirmed, skipped, achievement, onChange, onCommit, feedbackToken, disabled, presentation = "default" }: { variable: JournalVariable; value: DraftValue; draftKey: string; confirmed: boolean; skipped: boolean; achievement?: JournalAchievement; onChange: (value: DraftValue) => void; onCommit?: () => void; feedbackToken?: number; disabled: boolean; presentation?: "default" | "personal-lab" }) {
  const stateLabel = confirmed ? "Enregistrée" : skipped ? "Non renseignée" : "À confirmer";
  const classes = ["journal-field", confirmed ? "journal-field--confirmed" : "", skipped ? "journal-field--skipped" : "", feedbackToken ? "journal-field--changed" : ""].filter(Boolean).join(" ");
  const canConfirmDisplayedValue = !disabled && !confirmed && !skipped && value !== null && variable.variableType !== "scale";
  const achievementLabel = achievement?.percentage === null ? "Progression —" : achievement ? `Progression ${achievement.percentage}%` : null;
  const label = journalVariableLabel(variable);
  const automaticDetectionLabel = variable.captureMode === "automatic" ? "Détection automatique" : null;
  const accessibleLabel = `${label}: ${stateLabel}${automaticDetectionLabel ? `, ${automaticDetectionLabel.toLocaleLowerCase("fr-FR")}` : ""}`;
  const headingContent = <><span className="journal-field__emoji" aria-hidden="true">{variable.emoji}</span><span className="journal-field__label"><span className="journal-field__label-text">{label}{automaticDetectionLabel && <span className="journal-field__automatic-indicator" role="img" aria-label={automaticDetectionLabel}><ScanLine size={12} aria-hidden="true" /></span>}</span>{achievementLabel && <small aria-label={`${label}: ${achievementLabel}`}>{achievementLabel}</small>}</span></>;
  return <div className={classes} data-state={confirmed ? "recorded" : skipped ? "skipped" : "pending"} aria-label={accessibleLabel}>
    {canConfirmDisplayedValue
      ? <button className="journal-field__heading journal-field__confirm-default" type="button" aria-label={`Confirmer la valeur affichée pour ${label}${automaticDetectionLabel ? `, ${automaticDetectionLabel.toLocaleLowerCase("fr-FR")}` : ""}`} onClick={() => onChange(value)}>{headingContent}</button>
      : <div className="journal-field__heading">{headingContent}</div>}
    {feedbackToken ? <span key={`${variable.id}-${feedbackToken}`} className="journal-field__feedback" aria-hidden="true" /> : null}
    {journalVariableKey(variable.name) === "breakfast" && value === true
      ? <div className="journal-breakfast-actions"><Field variable={variable} value={value} draftKey={draftKey} onChange={onChange} onCommit={onCommit} disabled={disabled} presentation={presentation} /><Link href="/meals#meal-breakfast" aria-label="Ajouter une photo du petit déjeuner"><ImagePlus size={15} aria-hidden="true" />Ajouter une photo</Link></div>
      : <Field variable={variable} value={value} draftKey={draftKey} onChange={onChange} onCommit={onCommit} disabled={disabled} presentation={presentation} />}
  </div>;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export type DailyJournalProps = {
  variables: JournalVariable[];
  entries: JournalEntry[];
  days: JournalDay[];
  achievements?: JournalAchievement[];
  todayDate: string;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  showDateNavigation?: boolean;
  availableDates?: readonly string[];
  onTodayBreakfastValidation?: (skipped: boolean) => void;
  onTodayMorningValidation?: (completed: boolean) => void;
  presentation?: "default" | "personal-lab";
};

export function DailyJournal({ variables, entries, days, achievements, todayDate, selectedDate: selectedDateProp, onDateChange, showDateNavigation = true, availableDates, onTodayBreakfastValidation, onTodayMorningValidation, presentation = "default" }: DailyJournalProps) {
  const router = useRouter();
  const activeVariables = useMemo(() => variables.filter((variable) => variable.isActive).sort((first, second) => first.position - second.position), [variables]);
  const achievementsByVariable = useMemo(() => new Map((achievements ?? []).map((achievement) => [achievement.variableId, achievement])), [achievements]);
  const sections = useMemo(() => journalDisplayOrder.flatMap((periodId) => {
    const period = journalDayPeriods.find((candidate) => candidate.id === periodId);
    if (!period) return [];
    const periodVariables = activeVariables.filter((variable) => displayedDayPeriod(variable) === period.id);
    return periodVariables.length > 0 ? [{ ...period, variables: periodVariables }] : [];
  }), [activeVariables]);
  const defaultAvailableDates = useMemo(() => Array.from({ length: 5 }, (_, index) => addDays(todayDate, -index)), [todayDate]);
  const dateOptions = availableDates ?? defaultAvailableDates;
  const [internalEntryDate, setInternalEntryDate] = useState(todayDate);
  const entryDate = selectedDateProp ?? internalEntryDate;
  const selectedDateRef = useRef(entryDate);
  const initialDrafts = useMemo(() => journalDraftsForDates(dateOptions, activeVariables, entries, days), [activeVariables, dateOptions, days, entries]);
  const [draftsByDate, setDraftsByDate] = useState<JournalDraftsByDate>(initialDrafts);
  const drafts = useRef<JournalDraftsByDate>(initialDrafts);
  const pendingSavesByDate = useRef<Record<string, number>>({});
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [validatingDate, setValidatingDate] = useState<string | null>(null);
  const [validatedDate, setValidatedDate] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<JournalSaveStatus>("draft");
  const [error, setError] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ fieldId: string; token: number } | null>(null);
  const [recordedByDate, setRecordedByDate] = useState<Record<string, Set<string>>>(() => Object.fromEntries(dateOptions.map((date) => [date, new Set(entries.filter((entry) => entry.entryDate === date).map((entry) => entry.variableId))])));
  const [skippedByDate, setSkippedByDate] = useState<Record<string, Set<string>>>(() => Object.fromEntries(dateOptions.map((date) => [date, new Set(days.find((day) => day.entryDate === date)?.omittedVariableIds ?? [])])));
  const feedbackSequence = useRef(0);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNumericFeedback = useRef(new Set<string>());
  const day = days.find((candidate) => candidate.entryDate === entryDate);
  const validated = day?.status === "validated" || validatedDate === entryDate;
  const validating = validatingDate === entryDate;
  const values = draftsByDate[entryDate] ?? journalValuesForDate(activeVariables, entries, days, entryDate);
  const recorded = recordedByDate[entryDate] ?? new Set<string>();
  const skipped = skippedByDate[entryDate] ?? new Set<string>();

  useEffect(() => () => {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
  }, []);

  useEffect(() => {
    const pendingDates = new Set(Object.entries(pendingSavesByDate.current).filter(([, count]) => count > 0).map(([date]) => date));
    const next = reconcileJournalDrafts(initialDrafts, drafts.current, pendingDates);
    drafts.current = next;
    setDraftsByDate(next);
  }, [initialDrafts]);

  useEffect(() => {
    if (selectedDateRef.current === entryDate) return;
    selectedDateRef.current = entryDate;
    setSaveStatus("draft");
    setError(null);
    pendingNumericFeedback.current.clear();
  }, [entryDate]);

  function triggerFeedback(fieldId: string) {
    feedbackSequence.current += 1;
    setFeedback({ fieldId, token: feedbackSequence.current });
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(() => setFeedback(null), 520);
  }

  function commitField(fieldId: string) {
    if (!pendingNumericFeedback.current.delete(fieldId)) return;
    triggerFeedback(fieldId);
  }

  async function persist(date: string, mode: "draft" | "validate", draftValues: Record<string, DraftValue>, changedVariableId?: string) {
    const included = mode === "validate" ? new Set([...(recordedByDate[date] ?? []), ...(skippedByDate[date] ?? [])]) : undefined;
    const entriesToSave = journalEntriesForSave(activeVariables.map((variable) => variable.id), draftValues, mode, changedVariableId, included);
    const response = await fetch("/api/lab/entries", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryDate: date, mode, entries: entriesToSave }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Le journal n’a pas pu être enregistré.");
  }

  function queueDraft(date: string, variableId: string, draftValues: Record<string, DraftValue>) {
    pendingSavesByDate.current[date] = (pendingSavesByDate.current[date] ?? 0) + 1;
    setSaveStatus("saving");
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => persist(date, "draft", draftValues, variableId))
      .then(() => {
        const breakfast = activeVariables.find((variable) => variable.id === variableId && variable.variableType === "boolean" && journalVariableKey(variable.name) === "breakfast");
        const dayIsValidated = days.some((candidate) => candidate.entryDate === date && candidate.status === "validated") || validatedDate === date;
        if (date === todayDate && breakfast && dayIsValidated) onTodayBreakfastValidation?.(draftValues[breakfast.id] === false);
        if (date === selectedDateRef.current && pendingSavesByDate.current[date] === 1) {
          setSaveStatus("saved");
          setError(null);
          if (days.find((candidate) => candidate.entryDate === date)?.status === "validated") router.refresh();
        }
      })
      .catch((saveError) => {
        if (date === selectedDateRef.current) {
          setSaveStatus("error");
          setError(saveError instanceof Error ? saveError.message : "Le journal n’a pas pu être enregistré.");
        }
      })
      .finally(() => {
        const remaining = (pendingSavesByDate.current[date] ?? 1) - 1;
        if (remaining > 0) pendingSavesByDate.current[date] = remaining;
        else delete pendingSavesByDate.current[date];
      });
  }

  async function validate() {
    const date = selectedDateRef.current;
    pendingSavesByDate.current[date] = (pendingSavesByDate.current[date] ?? 0) + 1;
    setValidatingDate(date);
    setSaveStatus("saving");
    try {
      await saveQueue.current;
      await persist(date, "validate", drafts.current[date] ?? journalValuesForDate(activeVariables, entries, days, date));
      if (date === selectedDateRef.current) {
        setValidatedDate(date);
        setSaveStatus("saved");
        setError(null);
      }
      if (date === todayDate) {
        const breakfast = activeVariables.find((variable) => variable.variableType === "boolean" && journalVariableKey(variable.name) === "breakfast");
        const explicitlyRecorded = breakfast ? (recordedByDate[date] ?? new Set<string>()).has(breakfast.id) : false;
        onTodayBreakfastValidation?.(Boolean(breakfast && explicitlyRecorded && drafts.current[date]?.[breakfast.id] === false));
        const morningIds = activeVariables.filter((variable) => variable.dayPeriod === "morning").map((variable) => variable.id);
        const morningRecorded = morningIds.some((id) => (recordedByDate[date] ?? new Set<string>()).has(id) || (skippedByDate[date] ?? new Set<string>()).has(id));
        onTodayMorningValidation?.(morningIds.length > 0 && morningRecorded);
      }
      router.refresh();
    } catch (saveError) {
      if (date === selectedDateRef.current) {
        setSaveStatus("error");
        setError(saveError instanceof Error ? saveError.message : "Cette journée n’a pas pu être validée.");
      }
    } finally {
      const remaining = (pendingSavesByDate.current[date] ?? 1) - 1;
      if (remaining > 0) pendingSavesByDate.current[date] = remaining;
      else delete pendingSavesByDate.current[date];
      setValidatingDate(null);
    }
  }

  function changeDate(date: string) {
    if (!dateOptions.includes(date)) return;
    selectedDateRef.current = date;
    if (selectedDateProp === undefined) setInternalEntryDate(date);
    onDateChange?.(date);
    if (!drafts.current[date]) {
      const next = { ...drafts.current, [date]: journalValuesForDate(activeVariables, entries, days, date) };
      drafts.current = next;
      setDraftsByDate(next);
    }
    setSaveStatus("draft");
    setError(null);
    pendingNumericFeedback.current.clear();
  }

  function changeValue(variableId: string, value: DraftValue) {
    const date = selectedDateRef.current;
    const variable = activeVariables.find((candidate) => candidate.id === variableId);
    const next = updateJournalDraft(drafts.current, date, variableId, value);
    drafts.current = next;
    setDraftsByDate(next);
    setRecordedByDate((current) => {
      const nextRecorded = new Set(current[date] ?? []);
      if (value === null) nextRecorded.delete(variableId);
      else nextRecorded.add(variableId);
      return { ...current, [date]: nextRecorded };
    });
    setSkippedByDate((current) => {
      const nextSkipped = new Set(current[date] ?? []);
      if (value === null) nextSkipped.add(variableId);
      else nextSkipped.delete(variableId);
      return { ...current, [date]: nextSkipped };
    });
    if (variable && textNumericTypes.has(variable.variableType)) pendingNumericFeedback.current.add(variableId);
    else if (variable) triggerFeedback(variableId);
    queueDraft(date, variableId, next[date]);
  }

  function confirmPeriodDefaults(periodVariables: JournalVariable[]) {
    for (const variable of periodVariables) {
      const displayedValue = values[variable.id] ?? null;
      if (!recorded.has(variable.id) && !skipped.has(variable.id) && displayedValue !== null) changeValue(variable.id, displayedValue);
    }
  }

  const isPersonalLab = presentation === "personal-lab";
  const statusClass = ["checkin-state", "journal-save-status", validated || saveStatus === "saved" ? "checkin-state--saved" : "", saveStatus === "error" ? "checkin-state--error" : ""].filter(Boolean).join(" ");
  const statusText = journalStatusText({ validated, validating, saveStatus });
  const personalLabIndexes: Record<string, string> = { morning: "01", day: "02", evening: "03", context: "04" };
  const placeValidationInMorning = isPersonalLab && sections.some((section) => section.id === "morning");
  const validationAction = !validated ? <button className={`primary-button${isPersonalLab ? " primary-button--validate" : ""}`} type="button" onClick={() => void validate()} disabled={validatingDate !== null}>{validating ? <><LoaderCircle className="spin" size={16} aria-hidden="true" />Validation…</> : "Valider la journée"}</button> : null;
  return <section className={`checkin-card journal-card${isPersonalLab ? " journal-card--personal-lab" : ""}`} aria-labelledby="journal-title"><header className="journal-card__header"><div className="journal-card__heading"><h2 id="journal-title">Journal</h2></div><div className="journal-card__actions" role="group" aria-label="Actions du journal"><span className={statusClass} data-draft={saveStatus === "draft" && !validating && !validated ? "true" : undefined} aria-live="polite" aria-atomic="true">
      {validating || saveStatus === "saving" ? <LoaderCircle className="journal-save-status__icon spin" size={14} aria-hidden="true" /> : saveStatus === "error" ? <span className="journal-save-status__icon journal-save-status__icon--error" aria-hidden="true">!</span> : null}
      <span>{statusText}</span>
    </span>
    {!placeValidationInMorning && validationAction}
    {!managerOpen && <button className="text-link" type="button" aria-label="Modifier les champs du journal" onClick={() => setManagerOpen(true)}>Modifier</button>}
  </div></header>
    {showDateNavigation && <nav className="journal-date-strip" aria-label="Date du journal">{dateOptions.map((date, index) => <button type="button" aria-current={date === entryDate ? "date" : undefined} onClick={() => changeDate(date)} key={date}><span>{index === 0 ? "Aujourd’hui" : new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "")}</span><small>{date.slice(8)}</small></button>)}</nav>}
    {activeVariables.length > 0 ? <div className="journal-sections">{sections.map((section) => {
      const completedCount = section.variables.filter((variable) => recorded.has(variable.id)).length;
      const complete = completedCount === section.variables.length;
      const canConfirmDefaults = section.variables.some((variable) => !recorded.has(variable.id) && !skipped.has(variable.id) && (values[variable.id] ?? null) !== null);
      const sectionLabel = dayPeriodLabel(section.id);
      const sectionIndex = isPersonalLab ? personalLabIndexes[section.id] : undefined;
      return <section className={`journal-period${complete ? " journal-period--complete" : ""}`} aria-labelledby={`journal-${section.id}-title`} aria-label={`${sectionLabel}${complete ? ", complète" : ""}`} key={section.id} data-period={section.id} data-complete={complete ? "true" : "false"}>
      <header className={`journal-period__header${canConfirmDefaults ? " journal-period__header--actionable" : ""}`}><div className={`journal-period__header-row${placeValidationInMorning && section.id === "morning" ? " journal-period__header-row--morning" : ""}`}><h3 id={`journal-${section.id}-title`}>{canConfirmDefaults ? <button type="button" aria-label={`Confirmer toutes les valeurs affichées pour ${sectionLabel}`} onClick={() => confirmPeriodDefaults(section.variables)}>{sectionIndex && <span className="journal-period__index" aria-hidden="true">{sectionIndex}</span>}<span>{sectionLabel}</span></button> : <>{sectionIndex && <span className="journal-period__index" aria-hidden="true">{sectionIndex}</span>}<span>{sectionLabel}</span></>}</h3>{placeValidationInMorning && section.id === "morning" ? validationAction : null}</div></header>
      <div className="journal-grid">{section.variables.map((variable) => <JournalFieldRow variable={variable} value={values[variable.id] ?? null} draftKey={entryDate} confirmed={recorded.has(variable.id)} skipped={skipped.has(variable.id)} achievement={achievementsByVariable.get(variable.id)} feedbackToken={feedback?.fieldId === variable.id ? feedback.token : undefined} onCommit={() => commitField(variable.id)} disabled={false} presentation={presentation} onChange={(value) => changeValue(variable.id, value)} key={variable.id} />)}</div>
    </section>;
    })}</div> : <p className="journal-empty">Ajoute ta première mesure suivie ci-dessous.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {validated && <p className="journal-save-note" role="status">Les modifications sont enregistrées automatiquement et restent incluses dans tes relations.</p>}
    <VariableManager variables={variables} open={managerOpen} onClose={() => setManagerOpen(false)} />
  </section>;
}
