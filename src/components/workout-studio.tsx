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

function ExerciseFigure({ name }: { name: string }) {
  const normalizedName = name.toLowerCase();
  const mode = normalizedName.includes("squat") ? "squat" : normalizedName.includes("press") ? "press" : normalizedName.includes("plank") ? "plank" : "hinge";
  return <div className={`exercise-figure exercise-figure--${mode}`} role="img" aria-label={`Simplified animated form guide for ${name}`}><svg viewBox="0 0 240 180" aria-hidden="true"><line className="floor" x1="30" y1="151" x2="210" y2="151" /><g className="figure-body"><circle cx="120" cy="35" r="14" /><line x1="120" y1="50" x2="120" y2="100" /><line x1="120" y1="62" x2="84" y2="83" /><line x1="120" y1="62" x2="156" y2="83" /><line x1="120" y1="100" x2="92" y2="145" /><line x1="120" y1="100" x2="148" y2="145" /><line className="weight" x1="63" y1="81" x2="177" y2="81" /></g></svg><span>Form guide · simplified illustration</span></div>;
}

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
    if (builderDirty) setDiscardConfirmation(true);
    else setBuilderOpen(false);
  }, [builderDirty, saving]);

  const requestCloseLive = useCallback(() => {
    if (!updatingSession) setStopConfirmation(true);
  }, [updatingSession]);

  useDialogLayer({ open: builderOpen, onClose: requestCloseBuilder, containerRef: builderRef });
  useDialogLayer({ open: Boolean(active), onClose: requestCloseLive, containerRef: liveRef });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workouts", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Workout studio could not be loaded.")))
      .then((data) => {
        setExercises(Array.isArray(data.exercises) ? data.exercises.filter(isExercise) : []);
        const local = window.localStorage.getItem("soma:workout-programs");
        if (local) {
          try { setPrograms(normalizePrograms(JSON.parse(local))); }
          catch { setPrograms(normalizePrograms(data.programs)); window.localStorage.removeItem("soma:workout-programs"); }
        } else setPrograms(normalizePrograms(data.programs));
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
      if (!response.ok) throw new Error(result.error ?? "Program could not be saved.");
      const program = { id: result.id, name: name.trim(), exercises: selected };
      const next = [program, ...programs];
      setPrograms(next);
      window.localStorage.setItem("soma:workout-programs", JSON.stringify(next));
      setBuilderOpen(false);
      resetBuilder();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Program could not be saved.");
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
      if (!response.ok) throw new Error(result.error ?? "Workout could not be started.");
      setActive({ program, sessionId: result.id, exerciseIndex: 0, setIndex: 1, elapsed: 0, rest: 0, paused: false });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Workout could not be started.");
    } finally {
      setStartingId(null);
    }
  }

  async function patchSession(body: Record<string, unknown>) {
    if (!active) throw new Error("No active workout.");
    const response = await fetch(`/api/workouts/sessions/${active.sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Workout progress could not be saved.");
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
      setActionError(error instanceof Error ? error.message : "Workout timer could not be updated.");
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
      setActionError(error instanceof Error ? error.message : "Workout could not be finished.");
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
        if (!response.ok) throw new Error("The final set was saved, but the workout could not be finished.");
        setActive(null);
        return;
      }
      setActive((current) => current ? { ...current, exerciseIndex: lastSet ? current.exerciseIndex + 1 : current.exerciseIndex, setIndex: lastSet ? 1 : current.setIndex + 1, rest: currentExercise.restSeconds } : null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Set could not be saved.");
    } finally { setUpdatingSession(false); }
  }

  if (loading) return <div className="workout-loading" id="main-page-content" role="status"><LoaderCircle className="spin" />Loading workout studio…</div>;
  if (loadError) return <div className="workout-page" id="main-page-content"><div className="load-error" role="alert"><AlertCircle /><h1>Workout studio could not load</h1><p>{loadError}</p><button className="secondary-button" type="button" onClick={() => { setLoading(true); setLoadError(null); setRetryVersion((current) => current + 1); }}><RotateCcw size={16} />Try again</button></div></div>;

  return <div className="workout-page" id="main-page-content">
    <header className="workout-header"><h1>Workouts</h1><button className="primary-button" type="button" onClick={() => setBuilderOpen(true)}><Plus size={17} />New program</button></header>
    <section className="workout-summary" aria-label="Workout summary"><article><span>Programs</span><strong>{programs.length}</strong></article><article><span>Planned sets</span><strong>{totalSets}</strong></article><article><span>Primary goal</span><strong>Build muscle</strong></article></section>
    {actionError && !builderOpen && !active && <p className="form-error" role="alert">{actionError}</p>}
    {programs.length ? <section className="program-grid" aria-label="Your workout programs">{programs.map((program) => <article className="program-card" key={program.id}><div className="program-icon"><Dumbbell /></div><span>{program.exercises.length} exercise{program.exercises.length === 1 ? "" : "s"}</span><h2>{program.name}</h2><ul>{program.exercises.slice(0, 4).map((item) => <li key={item.exercise.id}>{item.exercise.name}<span>{item.sets} × {item.repsMin}–{item.repsMax}</span></li>)}</ul><button disabled={Boolean(startingId)} type="button" onClick={() => void start(program)}>{startingId === program.id ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}{startingId === program.id ? "Starting…" : "Start workout"}</button></article>)}</section> : <section className="workout-empty"><Dumbbell size={28} /><h2>Create your first program</h2><p>Use <strong>New program</strong> above to choose exercises, sets, repetitions, and rest.</p></section>}

    {builderOpen && <><button className="panel-backdrop" type="button" onClick={requestCloseBuilder} aria-label="Close program builder" /><div ref={builderRef} className="workout-modal" role="dialog" aria-modal="true" aria-labelledby="builder-title"><header><div><span className="eyebrow">Program builder</span><h2 id="builder-title">Design your session</h2></div><button className="icon-button" onClick={requestCloseBuilder} type="button" aria-label="Close builder"><X /></button></header><label className="builder-name">Program name<input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label><div className="builder-layout"><section><div className="builder-section-heading"><h3>Exercise library</h3><span>{selected.length} selected</span></div><label className="exercise-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search exercises</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" /></label><div className="exercise-picker">{filteredExercises.length ? filteredExercises.map((exercise) => <button className={selected.some((item) => item.exercise.id === exercise.id) ? "is-selected" : ""} aria-pressed={selected.some((item) => item.exercise.id === exercise.id)} key={exercise.id} onClick={() => toggleExercise(exercise)} type="button"><span>{exercise.name}<small>{exercise.muscle_groups.join(" · ")}</small></span>{selected.some((item) => item.exercise.id === exercise.id) ? <Check size={17} /> : <Plus size={17} />}</button>) : <p className="empty-state">No exercises match “{query}”.</p>}</div></section><section><h3>Program details</h3>{selected.length ? <div className="selected-exercises">{selected.map((item) => <article key={item.exercise.id}><strong>{item.exercise.name}</strong><button type="button" className="remove-exercise" onClick={() => toggleExercise(item.exercise)} aria-label={`Remove ${item.exercise.name}`}><X size={15} /></button><div><label>Sets<input type="number" min="1" max="20" value={item.sets} onChange={(event) => updateExercise(item.exercise.id, "sets", Number(event.target.value))} /></label><label>Min reps<input type="number" min="1" max="1000" value={item.repsMin} onChange={(event) => updateExercise(item.exercise.id, "repsMin", Number(event.target.value))} /></label><label>Max reps<input type="number" min={item.repsMin} max="1000" value={item.repsMax} onChange={(event) => updateExercise(item.exercise.id, "repsMax", Number(event.target.value))} /></label><label>Rest (sec)<input type="number" min="0" max="3600" value={item.restSeconds} onChange={(event) => updateExercise(item.exercise.id, "restSeconds", Number(event.target.value))} /></label></div>{item.repsMax < item.repsMin && <p className="field-error">Maximum reps must be at least the minimum.</p>}</article>)}</div> : <p className="empty-state">Select at least one exercise to build the session.</p>}</section></div><footer><span>{invalidProgram && selected.length ? "Check every set, rep, and rest value." : `${selected.length} exercise${selected.length === 1 ? "" : "s"}`}</span><button className="primary-button" disabled={invalidProgram || saving} onClick={() => void saveProgram()} type="button">{saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{saving ? "Saving…" : "Save program"}</button></footer>{actionError && <p className="modal-error" role="alert">{actionError}</p>}{discardConfirmation && <div className="modal-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="discard-title"><h3 id="discard-title">Discard this draft?</h3><p>Your selected exercises and changes will be lost.</p><div><button autoFocus className="secondary-button" type="button" onClick={() => setDiscardConfirmation(false)}>Keep editing</button><button className="danger-button" type="button" onClick={() => { setBuilderOpen(false); resetBuilder(); }}>Discard draft</button></div></div>}</div></>}

      {active && currentExercise && <div ref={liveRef} className="live-workout" role="dialog" aria-modal="true" aria-label="Live workout"><header><button type="button" onClick={requestCloseLive} aria-label="End workout"><X /></button><div><span>{active.program.name}</span><strong><Timer size={15} />{formatTimer(active.elapsed)}</strong></div><button disabled={updatingSession} type="button" onClick={() => void togglePause()} aria-label={active.paused ? "Resume workout timer" : "Pause workout timer"}>{updatingSession ? <LoaderCircle className="spin" /> : active.paused ? <Play /> : <Pause />}</button></header><section className="live-workout-content"><div className="live-progress"><span>Exercise {active.exerciseIndex + 1} of {active.program.exercises.length}</span><span style={{ width: `${((active.exerciseIndex + active.setIndex / currentExercise.sets) / active.program.exercises.length) * 100}%` }} /></div><ExerciseFigure name={currentExercise.exercise.name} /><div className="live-title"><span>Set {active.setIndex} of {currentExercise.sets}</span><h1>{currentExercise.exercise.name}</h1><p>{currentExercise.repsMin}–{currentExercise.repsMax} reps · controlled form</p></div>{actionError && <p className="form-error" role="alert">{actionError}</p>}{active.rest > 0 && <div className="rest-timer" aria-live="polite"><span>Rest</span><strong>{formatTimer(active.rest)}</strong><div><button type="button" aria-label="Shorten rest by 15 seconds" onClick={() => setActive({ ...active, rest: Math.max(0, active.rest - 15) })}><Minus />15 sec</button><button type="button" aria-label="Add 15 seconds to rest" onClick={() => setActive({ ...active, rest: active.rest + 15 })}><Plus />15 sec</button></div></div>}<button className="complete-set" disabled={updatingSession} type="button" onClick={() => void completeSet()}>{updatingSession ? <LoaderCircle className="spin" /> : <Check />}{updatingSession ? "Saving set…" : "Complete set"}</button><div className="live-navigation"><button disabled={active.exerciseIndex === 0 || updatingSession} type="button" onClick={() => setActive({ ...active, exerciseIndex: Math.max(0, active.exerciseIndex - 1), setIndex: 1 })}><ChevronLeft />Previous</button><button disabled={!active.rest} type="button" onClick={() => setActive({ ...active, rest: 0 })}><RotateCcw />Skip rest</button><button disabled={active.exerciseIndex === active.program.exercises.length - 1 || updatingSession} type="button" onClick={() => setActive({ ...active, exerciseIndex: Math.min(active.program.exercises.length - 1, active.exerciseIndex + 1), setIndex: 1 })}>Next<ChevronRight /></button></div>{stopConfirmation && <div className="modal-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="finish-title"><h2 id="finish-title">End this workout?</h2><p>Your completed sets and duration will be saved. You cannot resume this session.</p><div><button className="secondary-button" type="button" onClick={() => setStopConfirmation(false)}>Keep training</button><button className="danger-button" disabled={updatingSession} type="button" onClick={() => void finish()}>{updatingSession ? "Ending…" : "End workout"}</button></div></div>}</section></div>}
  </div>;
}
