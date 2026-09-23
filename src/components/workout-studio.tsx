"use client";

import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  LoaderCircle,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Timer,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDialogLayer } from "@/components/use-dialog-layer";

type Exercise = { id: string; name: string; muscle_groups: string[]; equipment: string[]; instructions: string[] };
type ProgramExercise = { exercise: Exercise; sets: number; repsMin: number; repsMax: number; restSeconds: number };
type Program = { id: string; name: string; description?: string; exercises: ProgramExercise[] };
type ActiveSession = { program: Program; sessionId: string; exerciseIndex: number; setIndex: number; elapsed: number; rest: number; paused: boolean };
const goalLabels: Record<string, string> = { build_muscle: "Développer la masse musculaire", improve_endurance: "Améliorer l’endurance", improve_cardio: "Améliorer le cardio", general_fitness: "Forme générale", maintain_health: "Maintenir la santé", other: "Autre" };

function formatTimer(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function isExercise(value: unknown): value is Exercise {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Exercise>;
  return typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.muscle_groups) && Array.isArray(item.equipment) && Array.isArray(item.instructions);
}

function normalizePrograms(value: unknown): Program[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    if (typeof source.id !== "string" || typeof source.name !== "string") return [];
    const direct = Array.isArray(source.exercises) ? source.exercises : null;
    if (direct) {
      const exercises = direct.filter((entry): entry is ProgramExercise => {
        if (!entry || typeof entry !== "object") return false;
        const candidate = entry as Partial<ProgramExercise>;
        return isExercise(candidate.exercise) && [candidate.sets, candidate.repsMin, candidate.repsMax, candidate.restSeconds].every(Number.isFinite);
      });
      return exercises.length ? [{ id: source.id, name: source.name, description: typeof source.description === "string" ? source.description : undefined, exercises }] : [];
    }
    const rows = Array.isArray(source.workout_program_exercises) ? source.workout_program_exercises : [];
    const exercises = rows
      .slice()
      .sort((left, right) => Number((left as Record<string, unknown>).position ?? 0) - Number((right as Record<string, unknown>).position ?? 0))
      .flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const entry = row as Record<string, unknown>;
        const exercise = entry.exercise_library;
        if (!isExercise(exercise)) return [];
        return [{ exercise, sets: Number(entry.target_sets), repsMin: Number(entry.target_reps_min), repsMax: Number(entry.target_reps_max), restSeconds: Number(entry.rest_seconds) }];
      });
    return exercises.length ? [{ id: source.id, name: source.name, description: typeof source.description === "string" ? source.description : undefined, exercises }] : [];
  });
}

export function WorkoutStudio() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [primaryGoal, setPrimaryGoal] = useState("general_fitness");
  const [primaryGoalDirection, setPrimaryGoalDirection] = useState("");
  const [selected, setSelected] = useState<ProgramExercise[]>([]);
  const [name, setName] = useState("Full Body A");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [updatingSession, setUpdatingSession] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [discardConfirmation, setDiscardConfirmation] = useState(false);
  const [stopConfirmation, setStopConfirmation] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const builderRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const activeSessionId = active?.sessionId;
  const activePaused = active?.paused;
  const builderDirty = selected.length > 0 || name !== "Full Body A";

  const resetBuilder = useCallback(() => {
    setSelected([]);
    setName("Full Body A");
    setQuery("");
    setDiscardConfirmation(false);
    setActionError(null);
  }, []);

  const requestCloseBuilder = useCallback(() => {
    if (saving) return;
    if (discardConfirmation) setDiscardConfirmation(false);
    else if (builderDirty) setDiscardConfirmation(true);
    else setBuilderOpen(false);
  }, [builderDirty, discardConfirmation, saving]);

  const requestCloseLive = useCallback(() => {
    if (updatingSession) return;
    if (stopConfirmation) setStopConfirmation(false);
    else setStopConfirmation(true);
  }, [stopConfirmation, updatingSession]);

  useDialogLayer({ open: builderOpen, onClose: requestCloseBuilder, containerRef: builderRef });
  useDialogLayer({ open: Boolean(active), onClose: requestCloseLive, containerRef: liveRef });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workouts", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("L’espace entraînement n’a pas pu être chargé.")))
      .then((data) => {
        setExercises(Array.isArray(data.exercises) ? data.exercises.filter(isExercise) : []);
        setPrograms(normalizePrograms(data.programs));
        setPrimaryGoal(typeof data.primaryGoal === "string" ? data.primaryGoal : "general_fitness");
        setPrimaryGoalDirection(typeof data.primaryGoalDirection === "string" ? data.primaryGoalDirection : "");
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setLoadError(error.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [retryVersion]);

  useEffect(() => {
    if (!activeSessionId || activePaused) return;
    const timer = window.setInterval(() => setActive((current) => current ? { ...current, elapsed: current.elapsed + 1, rest: Math.max(0, current.rest - 1) } : null), 1000);
    return () => window.clearInterval(timer);
  }, [activePaused, activeSessionId]);

  const filteredExercises = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return exercises;
    return exercises.filter((exercise) => `${exercise.name} ${exercise.muscle_groups.join(" ")} ${exercise.equipment.join(" ")}`.toLowerCase().includes(cleanQuery));
  }, [exercises, query]);

  const invalidProgram = !name.trim() || !selected.length || selected.some((item) => !Number.isInteger(item.sets) || item.sets < 1 || item.sets > 20 || !Number.isInteger(item.repsMin) || item.repsMin < 1 || item.repsMin > 1000 || !Number.isInteger(item.repsMax) || item.repsMax < item.repsMin || item.repsMax > 1000 || !Number.isInteger(item.restSeconds) || item.restSeconds < 0 || item.restSeconds > 3600);
  const totalSets = useMemo(() => programs.reduce((sum, program) => sum + program.exercises.reduce((inner, item) => inner + item.sets, 0), 0), [programs]);
  const currentExercise = active?.program.exercises[active.exerciseIndex];

  function toggleExercise(exercise: Exercise) {
    setSelected((current) => current.some((item) => item.exercise.id === exercise.id) ? current.filter((item) => item.exercise.id !== exercise.id) : [...current, { exercise, sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90 }]);
    setActionError(null);
  }

  function updateExercise(id: string, key: keyof Omit<ProgramExercise, "exercise">, value: number) {
    setSelected((current) => current.map((item) => item.exercise.id === id ? { ...item, [key]: value } : item));
  }

  async function saveProgram() {
    if (invalidProgram || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = await fetch("/api/workouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), exercises: selected.map((item) => ({ exerciseId: item.exercise.id, sets: item.sets, repsMin: item.repsMin, repsMax: item.repsMax, restSeconds: item.restSeconds })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Le programme n’a pas pu être enregistré.");
      const program = { id: result.id, name: name.trim(), exercises: selected };
      setPrograms((current) => [program, ...current]);
      setBuilderOpen(false);
      resetBuilder();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Le programme n’a pas pu être enregistré.");
    } finally {
      setSaving(false);
    }
  }

  async function start(program: Program) {
    if (startingId) return;
    setStartingId(program.id);
    setActionError(null);
    try {
      const response = await fetch("/api/workouts/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programId: program.id, name: program.name }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "La séance n’a pas pu démarrer.");
      setActive({ program, sessionId: result.id, exerciseIndex: 0, setIndex: 1, elapsed: 0, rest: 0, paused: false });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "La séance n’a pas pu démarrer.");
    } finally {
      setStartingId(null);
    }
  }

  async function patchSession(body: Record<string, unknown>) {
    if (!active) throw new Error("Aucune séance active.");
    const response = await fetch(`/api/workouts/sessions/${active.sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "La progression de la séance n’a pas pu être enregistrée.");
    return result;
  }

  async function togglePause() {
    if (!active || updatingSession) return;
    setUpdatingSession(true);
    setActionError(null);
    try {
      await patchSession({ action: active.paused ? "resume" : "pause" });
      setActive((current) => current ? { ...current, paused: !current.paused } : null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Le minuteur de la séance n’a pas pu être mis à jour.");
    } finally { setUpdatingSession(false); }
  }

  async function finish() {
    if (!active || updatingSession) return;
    setUpdatingSession(true);
    setActionError(null);
    try {
      await patchSession({ action: "complete", durationSeconds: active.elapsed });
      setActive(null);
      setStopConfirmation(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "La séance n’a pas pu être terminée.");
      setStopConfirmation(false);
    } finally { setUpdatingSession(false); }
  }

  async function completeSet() {
    if (!active || !currentExercise || updatingSession) return;
    setUpdatingSession(true);
    setActionError(null);
    try {
      await patchSession({ action: "complete_set", exercisePosition: active.exerciseIndex, setIndex: active.setIndex, completedReps: currentExercise.repsMin, weightKg: null });
      const lastSet = active.setIndex >= currentExercise.sets;
      const lastExercise = active.exerciseIndex >= active.program.exercises.length - 1;
      if (lastSet && lastExercise) {
        const response = await fetch(`/api/workouts/sessions/${active.sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", durationSeconds: active.elapsed }) });
        if (!response.ok) throw new Error("La dernière série a été enregistrée, mais la séance n’a pas pu être terminée.");
        setActive(null);
        return;
      }
      setActive((current) => current ? { ...current, exerciseIndex: lastSet ? current.exerciseIndex + 1 : current.exerciseIndex, setIndex: lastSet ? 1 : current.setIndex + 1, rest: currentExercise.restSeconds } : null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "La série n’a pas pu être enregistrée.");
    } finally { setUpdatingSession(false); }
  }

  if (loading) return <div className="workout-loading" id="main-page-content" role="status"><LoaderCircle className="spin" />Chargement de l’espace entraînement…</div>;
  if (loadError) return <div className="workout-page" id="main-page-content"><div className="load-error" role="alert"><AlertCircle /><h1>L’espace entraînement n’a pas pu être chargé</h1><p>{loadError}</p><button className="secondary-button" type="button" onClick={() => { setLoading(true); setLoadError(null); setRetryVersion((current) => current + 1); }}><RotateCcw size={16} />Réessayer</button></div></div>;

  return <div className="workout-page" id="main-page-content">
    <header className="workout-header"><h1>Entraînements</h1><button className="primary-button" type="button" onClick={() => setBuilderOpen(true)}><Plus size={17} />Nouveau programme</button></header>
    <section className="workout-summary" aria-label="Résumé des entraînements"><article><span>Programmes</span><strong>{programs.length}</strong></article><article><span>Séries prévues</span><strong>{totalSets}</strong></article><article><span>Objectif principal</span><strong>{primaryGoalDirection || goalLabels[primaryGoal] || "Autre"}</strong></article></section>
    {actionError && !builderOpen && !active && <p className="form-error" role="alert">{actionError}</p>}
    {programs.length ? <section className="program-grid" aria-label="Vos programmes d’entraînement">{programs.map((program) => <article className="program-card" key={program.id}><div className="program-icon"><Dumbbell /></div><span>{program.exercises.length} exercice{program.exercises.length === 1 ? "" : "s"}</span><h2>{program.name}</h2><ul>{program.exercises.slice(0, 4).map((item) => <li key={item.exercise.id}>{item.exercise.name}<span>{item.sets} × {item.repsMin}–{item.repsMax}</span></li>)}</ul><button disabled={Boolean(startingId)} type="button" onClick={() => void start(program)}>{startingId === program.id ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}{startingId === program.id ? "Démarrage…" : "Démarrer la séance"}</button></article>)}</section> : <section className="workout-empty"><Dumbbell size={28} /><h2>Créez votre premier programme</h2><p>Utilisez <strong>Nouveau programme</strong> pour choisir vos exercices, séries, répétitions et temps de repos.</p></section>}

    {builderOpen && <><button className="panel-backdrop" type="button" onClick={requestCloseBuilder} aria-label="Fermer le créateur de programme" /><div ref={builderRef} className="workout-modal" role="dialog" aria-modal="true" aria-labelledby="builder-title"><header><div><span className="eyebrow">Créateur de programme</span><h2 id="builder-title">Composez votre séance</h2></div><button className="icon-button" onClick={requestCloseBuilder} type="button" aria-label="Fermer"><X /></button></header><label className="builder-name">Nom du programme<input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label><div className="builder-layout"><section><div className="builder-section-heading"><h3>Bibliothèque d’exercices</h3><span>{selected.length} sélectionné{selected.length === 1 ? "" : "s"}</span></div><label className="exercise-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Rechercher des exercices</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher des exercices" /></label><div className="exercise-picker">{filteredExercises.length ? filteredExercises.map((exercise) => <button className={selected.some((item) => item.exercise.id === exercise.id) ? "is-selected" : ""} aria-pressed={selected.some((item) => item.exercise.id === exercise.id)} key={exercise.id} onClick={() => toggleExercise(exercise)} type="button"><span>{exercise.name}<small>{exercise.muscle_groups.join(" · ")}</small></span>{selected.some((item) => item.exercise.id === exercise.id) ? <Check size={17} /> : <Plus size={17} />}</button>) : <p className="empty-state">Aucun exercice ne correspond à “{query}”.</p>}</div></section><section><h3>Détails du programme</h3>{selected.length ? <div className="selected-exercises">{selected.map((item) => <article key={item.exercise.id}><strong>{item.exercise.name}</strong><button type="button" className="remove-exercise" onClick={() => toggleExercise(item.exercise)} aria-label={`Retirer ${item.exercise.name}`}><X size={15} /></button><div><label>Séries<input type="number" min="1" max="20" value={item.sets} onChange={(event) => updateExercise(item.exercise.id, "sets", Number(event.target.value))} /></label><label>Répétitions min<input type="number" min="1" max="1000" value={item.repsMin} onChange={(event) => updateExercise(item.exercise.id, "repsMin", Number(event.target.value))} /></label><label>Répétitions max<input type="number" min={item.repsMin} max="1000" value={item.repsMax} onChange={(event) => updateExercise(item.exercise.id, "repsMax", Number(event.target.value))} /></label><label>Repos (s)<input type="number" min="0" max="3600" value={item.restSeconds} onChange={(event) => updateExercise(item.exercise.id, "restSeconds", Number(event.target.value))} /></label></div>{item.repsMax < item.repsMin && <p className="field-error">Les répétitions max doivent être au moins égales au min.</p>}</article>)}</div> : <p className="empty-state">Sélectionnez au moins un exercice pour composer la séance.</p>}</section></div><footer><span>{invalidProgram && selected.length ? "Vérifiez séries, répétitions et repos." : `${selected.length} exercice${selected.length === 1 ? "" : "s"}`}</span><button className="primary-button" disabled={invalidProgram || saving} onClick={() => void saveProgram()} type="button">{saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{saving ? "Enregistrement…" : "Enregistrer le programme"}</button></footer>{actionError && <p className="modal-error" role="alert">{actionError}</p>}{discardConfirmation && <div className="modal-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="discard-title"><h3 id="discard-title">Abandonner ce brouillon ?</h3><p>Les exercices sélectionnés et vos modifications seront perdus.</p><div><button autoFocus className="secondary-button" type="button" onClick={() => setDiscardConfirmation(false)}>Continuer la saisie</button><button className="danger-button" type="button" onClick={() => { setBuilderOpen(false); resetBuilder(); }}>Abandonner le brouillon</button></div></div>}</div></>}

      {active && currentExercise && <div ref={liveRef} className="live-workout" role="dialog" aria-modal="true" aria-label="Séance en cours"><header><button type="button" onClick={requestCloseLive} aria-label="Terminer la séance"><X /></button><div><span>{active.program.name}</span><strong><Timer size={15} />{formatTimer(active.elapsed)}</strong></div><button disabled={updatingSession} type="button" onClick={() => void togglePause()} aria-label={active.paused ? "Reprendre le minuteur" : "Mettre le minuteur en pause"}>{updatingSession ? <LoaderCircle className="spin" /> : active.paused ? <Play /> : <Pause />}</button></header><section className="live-workout-content"><div className="live-progress"><span>Exercice {active.exerciseIndex + 1} sur {active.program.exercises.length}</span><span style={{ width: `${((active.exerciseIndex + active.setIndex / currentExercise.sets) / active.program.exercises.length) * 100}%` }} /></div><div className="live-title"><span>Série {active.setIndex} sur {currentExercise.sets}</span><h1>{currentExercise.exercise.name}</h1><p>{currentExercise.repsMin}–{currentExercise.repsMax} répétitions</p></div>{currentExercise.exercise.instructions.length > 0 && <ol className="live-cues" aria-label={`${currentExercise.exercise.name} — consignes`}>{currentExercise.exercise.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>}{actionError && <p className="form-error" role="alert">{actionError}</p>}{active.rest > 0 && <div className="rest-timer" aria-live="polite"><span>Repos</span><strong>{formatTimer(active.rest)}</strong><div><button type="button" aria-label="Réduire le repos de 15 sondes" onClick={() => setActive({ ...active, rest: Math.max(0, active.rest - 15) })}><Minus />15 s</button><button type="button" aria-label="Ajouter 15 sondes de repos" onClick={() => setActive({ ...active, rest: active.rest + 15 })}><Plus />15 s</button></div></div>}<button className="complete-set" disabled={updatingSession} type="button" onClick={() => void completeSet()}>{updatingSession ? <LoaderCircle className="spin" /> : <Check />}{updatingSession ? "Enregistrement…" : "Valider la série"}</button><div className="live-navigation"><button disabled={active.exerciseIndex === 0 || updatingSession} type="button" onClick={() => setActive({ ...active, exerciseIndex: Math.max(0, active.exerciseIndex - 1), setIndex: 1 })}><ChevronLeft />Précédent</button><button disabled={!active.rest} type="button" onClick={() => setActive({ ...active, rest: 0 })}><RotateCcw />Passer le repos</button><button disabled={active.exerciseIndex === active.program.exercises.length - 1 || updatingSession} type="button" onClick={() => setActive({ ...active, exerciseIndex: Math.min(active.program.exercises.length - 1, active.exerciseIndex + 1), setIndex: 1 })}>Suivant<ChevronRight /></button></div>{stopConfirmation && <div className="modal-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="finish-title"><h2 id="finish-title">Terminer cette séance ?</h2><p>Les séries validées et la durée seront enregistrées. Cette séance ne pourra pas être reprise.</p><div><button className="secondary-button" type="button" onClick={() => setStopConfirmation(false)}>Continuer la séance</button><button className="danger-button" disabled={updatingSession} type="button" onClick={() => void finish()}>{updatingSession ? "Clôture…" : "Terminer la séance"}</button></div></div>}</section></div>}
  </div>;
}
