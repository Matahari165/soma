"use client";

import { Camera, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import type { JournalDay, JournalEntry, JournalVariable } from "@/domain/lab/journal";
import { MAX_MEAL_PHOTOS, type MealOrigin, type MealType } from "@/domain/meals";
import { fetchMeal, fetchMealWithTimeout } from "@/services/meal-client";
import { normalizeMealImage } from "@/services/meal-image";

type CaptureState = "idle" | "choosing-origin" | "uploading" | "accepted" | "analyzing" | "done" | "error";
type SlotState = { state: CaptureState; file: File | null; origin: MealOrigin | null; message: string | null; photoCount: number; filled: boolean; mealId?: string };
type QuickMealRecord = { id?: unknown; status?: unknown; analysisStatus?: unknown; analysis?: { status?: unknown } | null; photos?: unknown[]; note?: unknown };

const slots: Array<{ id: MealType; label: string }> = [
  { id: "breakfast", label: "Petit déjeuner" },
  { id: "lunch", label: "Déjeuner" },
  { id: "snack", label: "Collation" },
  { id: "dinner", label: "Dîner" },
];
const origins: Array<{ id: MealOrigin; label: string }> = [
  { id: "homemade", label: "Maison" },
  { id: "prepared", label: "Préparé / acheté" },
  { id: "mixed", label: "Mixte" },
];

const emptySlot = (): SlotState => ({ state: "idle", file: null, origin: null, message: null, photoCount: 0, filled: false });

export function mealQuickSlotIsFilled(meal: QuickMealRecord | null | undefined) {
  return Boolean(meal && (meal.status === "confirmed" || (Array.isArray(meal.photos) && meal.photos.length > 0) || (typeof meal.note === "string" && meal.note.trim().length > 0)));
}

export function morningJournalIsConfirmed(input: { todayDate: string; variables: JournalVariable[]; entries: JournalEntry[]; days: JournalDay[] }) {
  const day = input.days.find((candidate) => candidate.entryDate === input.todayDate);
  if (day?.status !== "validated") return false;
  const morningIds = input.variables.filter((variable) => variable.isActive && variable.dayPeriod === "morning").map((variable) => variable.id);
  return morningIds.some((id) => input.entries.some((entry) => entry.entryDate === input.todayDate && entry.variableId === id))
    || morningIds.some((id) => day.omittedVariableIds.includes(id));
}

export function breakfastIsExplicitlySkipped(input: { todayDate: string; variables: JournalVariable[]; entries: JournalEntry[]; days: JournalDay[] }) {
  const breakfast = input.variables.find((variable) => variable.variableType === "boolean" && variable.name.trim().toLocaleLowerCase("fr") === "breakfast");
  const validated = input.days.some((day) => day.entryDate === input.todayDate && day.status === "validated");
  const recordedNo = breakfast ? input.entries.some((entry) => entry.entryDate === input.todayDate && entry.variableId === breakfast.id && entry.value === false) : false;
  return validated && recordedNo;
}

async function responseJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof body.error === "string" ? body.error : "La photo n’a pas pu être enregistrée.");
    Object.assign(error, { code: typeof body.code === "string" ? body.code : "UNKNOWN_ANALYSIS_ERROR", requestId: typeof body.requestId === "string" ? body.requestId : response.headers.get("X-Analysis-Request-Id") });
    throw error;
  }
  return body as Record<string, unknown>;
}

async function uploadAndAnalyze(date: string, slot: MealType, file: File, origin: MealOrigin) {
  const key = `quick-${date}-${slot}`;
  const analysisRequestId = `analysis-${crypto.randomUUID()}`;
  const created = await responseJson(await fetchMealWithTimeout("/api/meals", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ mealDate: date, mealType: slot, status: "draft" }),
  }, 15_000, { operation: "create", requestId: analysisRequestId }));
  const meal = created.meal as { id?: unknown } | undefined;
  if (typeof meal?.id !== "string") throw new Error("Le repas n’a pas pu être créé.");
  const form = new FormData();
  form.append("photos", file, file.name);
  form.set("origin", origin);
  const uploadKey = `quick-${date}-${slot}-${file.name}-${file.size}-${file.lastModified}`;
  await responseJson(await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(meal.id)}/photos`, { method: "POST", headers: { "Idempotency-Key": uploadKey }, body: form }, 60_000, { operation: "upload", requestId: analysisRequestId }));
  const analysis = await responseJson(await fetchMeal(`/api/meals/${encodeURIComponent(meal.id)}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Analysis-Request-Id": analysisRequestId, "Idempotency-Key": analysisRequestId },
    body: JSON.stringify({ force: false, idempotencyKey: analysisRequestId }),
  }, { operation: "analyze", requestId: analysisRequestId }));
  return { mealId: meal.id, status: analysis.analysis && typeof analysis.analysis === "object" && typeof (analysis.analysis as { status?: unknown }).status === "string" ? (analysis.analysis as { status: string }).status : "queued" };
}

export function MealQuickCapture({ todayDate, variables, entries, days, breakfastDisabledOverride, morningJournalCompletedOverride }: { todayDate: string; variables: JournalVariable[]; entries: JournalEntry[]; days: JournalDay[]; breakfastDisabledOverride?: boolean; morningJournalCompletedOverride?: boolean }) {
  const breakfastDisabled = breakfastDisabledOverride ?? breakfastIsExplicitlySkipped({ todayDate, variables, entries, days });
  const morningJournalCompleted = morningJournalCompletedOverride ?? morningJournalIsConfirmed({ todayDate, variables, entries, days });
  const inputs = useRef<Partial<Record<MealType, HTMLInputElement | null>>>({});
  const photoButtons = useRef<Partial<Record<MealType, HTMLButtonElement | null>>>({});
  const firstOriginButtons = useRef<Partial<Record<MealType, HTMLButtonElement | null>>>({});
  const submittingSlots = useRef(new Set<MealType>());
  const [slotStates, setSlotStates] = useState<Record<MealType, SlotState>>(() => ({ breakfast: { ...emptySlot(), filled: morningJournalCompleted }, lunch: emptySlot(), dinner: emptySlot(), snack: emptySlot() }));
  const slotStatesRef = useRef(slotStates);
  slotStatesRef.current = slotStates;

  const activeJobKey = slots.map(({ id }) => `${id}:${slotStates[id].mealId ?? ""}:${slotStates[id].state}`).join("|");

  useEffect(() => {
    if (!breakfastDisabled) return;
    setSlotStates((current) => current.breakfast.state === "choosing-origin" ? { ...current, breakfast: { ...current.breakfast, state: "idle", file: null, origin: null, message: null } } : current);
  }, [breakfastDisabled]);

  useEffect(() => {
    let active = true;
    fetchMealWithTimeout(`/api/meals?from=${encodeURIComponent(todayDate)}&to=${encodeURIComponent(todayDate)}`, { cache: "no-store" }, 15_000, { operation: "load" })
      .then(responseJson)
      .then((body) => {
        if (!active || !Array.isArray(body.meals)) return;
        const counts = new Map<MealType, number>();
        const mealsBySlot = new Map<MealType, QuickMealRecord>();
        for (const raw of body.meals) {
          const meal = raw as { mealType?: MealType } & QuickMealRecord;
          if (!meal.mealType) continue;
          mealsBySlot.set(meal.mealType, meal);
          if (Array.isArray(meal.photos)) counts.set(meal.mealType, (counts.get(meal.mealType) ?? 0) + meal.photos.length);
        }
        setSlotStates((current) => Object.fromEntries(slots.map(({ id }) => {
          const meal = mealsBySlot.get(id);
          const analysisStatus = typeof meal?.analysisStatus === "string" ? meal.analysisStatus : typeof meal?.analysis?.status === "string" ? meal.analysis.status : null;
          const serverState: CaptureState = analysisStatus === "queued" ? "accepted" : analysisStatus === "running" ? "analyzing" : analysisStatus === "completed" ? "done" : current[id].state;
          return [id, {
            ...current[id],
            ...(typeof meal?.id === "string" ? { mealId: meal.id } : {}),
            state: current[id].state === "uploading" || current[id].state === "choosing-origin" ? current[id].state : serverState,
            photoCount: counts.has(id) ? counts.get(id) ?? 0 : current[id].photoCount,
            filled: current[id].filled || mealQuickSlotIsFilled(meal) || (id === "breakfast" && morningJournalCompleted),
          }];
        })) as Record<MealType, SlotState>);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [morningJournalCompleted, todayDate]);

  useEffect(() => {
    const activeSlots = slots.flatMap(({ id }) => {
      const item = slotStatesRef.current[id];
      return item.mealId && (item.state === "accepted" || item.state === "analyzing") ? [{ id, mealId: item.mealId }] : [];
    });
    if (!activeSlots.length) return;
    let cancelled = false;
    const refresh = async () => {
      await Promise.all(activeSlots.map(async ({ id, mealId }) => {
        try {
          const body = await responseJson(await fetchMeal(`/api/meals/${encodeURIComponent(mealId)}/analyze`, { cache: "no-store" }, { operation: "load" }));
          const analysis = body.analysis && typeof body.analysis === "object" ? body.analysis as { status?: unknown; error?: unknown } : null;
          if (cancelled || !analysis || typeof analysis.status !== "string") return;
          if (analysis.status === "completed") setSlotStates((current) => ({ ...current, [id]: { ...current[id], state: "done", message: "Analyse prête" } }));
          else if (analysis.status === "failed") setSlotStates((current) => ({ ...current, [id]: { ...current[id], state: "error", message: typeof analysis.error === "string" ? analysis.error : "L’analyse n’a pas abouti." } }));
          else setSlotStates((current) => ({ ...current, [id]: { ...current[id], state: analysis.status === "running" ? "analyzing" : "accepted" } }));
        } catch {
          // Reconnect failures are not job failures; retry on the next tick.
        }
      }));
    };
    void refresh();
    const delays = [2_000, 5_000, 10_000, 20_000, 30_000];
    let timer: number | null = null;
    let delayIndex = 0;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        await refresh();
        delayIndex = Math.min(delayIndex + 1, delays.length - 1);
        schedule();
      }, delays[delayIndex]);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        delayIndex = 0;
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        void refresh();
        schedule();
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeJobKey]);

  function chooseFile(slot: MealType, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    setSlotStates((current) => ({ ...current, [slot]: { ...current[slot], state: "choosing-origin", file, origin: null, message: null } }));
    requestAnimationFrame(() => firstOriginButtons.current[slot]?.focus());
  }

  async function submit(slot: MealType, origin: MealOrigin) {
    if (submittingSlots.current.has(slot)) return;
    const file = slotStates[slot].file;
    if (!file) return;
    submittingSlots.current.add(slot);
    setSlotStates((current) => ({ ...current, [slot]: { ...current[slot], state: "uploading", origin, message: null } }));
    const normalizationStartedAt = Date.now();
    try {
      const prepared = await normalizeMealImage(file);
      console.info("[meal-analysis] stage", { stage: "normalization", photoCount: 1, durationMs: Date.now() - normalizationStartedAt });
      const accepted = await uploadAndAnalyze(todayDate, slot, prepared, origin);
      setSlotStates((current) => ({ ...current, [slot]: { state: accepted.status === "running" ? "analyzing" : "accepted", mealId: accepted.mealId, file: null, origin: null, message: accepted.status === "running" ? "Analyse en cours" : "Analyse acceptée", photoCount: current[slot].photoCount + 1, filled: true } }));
    } catch (error) {
      if (Date.now() - normalizationStartedAt > 0) console.warn("[meal-analysis] stage failed", { stage: "normalization_or_upload", durationMs: Date.now() - normalizationStartedAt });
      setSlotStates((current) => ({ ...current, [slot]: { ...current[slot], state: "error", message: error instanceof Error ? error.message : "Échec de l’envoi." } }));
    } finally {
      submittingSlots.current.delete(slot);
    }
  }

  return <section className="meal-quick" aria-labelledby="meal-quick-title">
    <header><h2 id="meal-quick-title">Repas</h2><a href="/meals">Voir l’historique</a></header>
    <div className="meal-quick__rows">
      {slots.map(({ id, label }) => {
        const item = slotStates[id];
        const disabled = id === "breakfast" && breakfastDisabled;
        const busy = item.state === "uploading";
        const atLimit = item.photoCount >= MAX_MEAL_PHOTOS;
        const locked = !disabled && item.filled && item.state !== "error";
        const buttonLabel = disabled ? "Ignoré" : busy ? "Analyse…" : item.state === "accepted" ? "Acceptée" : item.state === "analyzing" ? "Analyse…" : item.state === "error" ? "Réessayer" : locked ? "Ajouté" : "Photo";
        return <div className={`meal-quick__row${disabled ? " is-disabled" : ""}${locked ? " is-filled" : ""}`} key={id}>
          <div className="meal-quick__summary"><strong>{label}</strong></div>
          <input ref={(node) => { inputs.current[id] = node; }} className="sr-only" type="file" accept="image/*" capture="environment" aria-label={`Choisir une photo pour ${label.toLocaleLowerCase("fr")}`} disabled={disabled || busy || atLimit || locked} onChange={(event) => chooseFile(id, event)} />
          {item.state === "choosing-origin" ? <div className="meal-quick__origins" role="group" aria-label={`Origine du repas — ${label}`}>
            {origins.map((origin, index) => <button ref={index === 0 ? (node) => { firstOriginButtons.current[id] = node; } : undefined} type="button" key={origin.id} disabled={disabled || busy} onClick={() => void submit(id, origin.id)}>{origin.label}</button>)}
            <button type="button" className="meal-quick__cancel" onClick={() => { setSlotStates((current) => ({ ...current, [id]: { ...current[id], state: "idle", file: null, origin: null } })); requestAnimationFrame(() => photoButtons.current[id]?.focus()); }}>Annuler</button>
          </div> : <button ref={(node) => { photoButtons.current[id] = node; }} type="button" className="meal-quick__photo" disabled={disabled || busy || atLimit || locked} aria-label={locked ? `Repas déjà renseigné pour ${label} — voir l’historique` : undefined} onClick={() => item.state === "error" && item.origin ? void submit(id, item.origin) : inputs.current[id]?.click()}>
            {busy ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : item.state === "error" ? <RefreshCw size={18} aria-hidden="true" /> : locked ? <Check size={18} aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}
            {buttonLabel}
          </button>}
          {item.state === "error" && <p className="meal-quick__error" role="alert">{item.message}</p>}
        </div>;
      })}
    </div>
  </section>;
}
