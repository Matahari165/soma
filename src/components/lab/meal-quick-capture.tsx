"use client";

import { Camera, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import type { JournalDay, JournalEntry, JournalVariable } from "@/domain/lab/journal";
import { MAX_MEAL_PHOTOS, type MealOrigin, type MealType } from "@/domain/meals";
import { normalizeMealImage } from "@/services/meal-image";

type CaptureState = "idle" | "choosing-origin" | "uploading" | "done" | "error";
type SlotState = { state: CaptureState; file: File | null; origin: MealOrigin | null; message: string | null; photoCount: number; filled: boolean };
type QuickMealRecord = { status?: unknown; photos?: unknown[] };

const slots: Array<{ id: MealType; label: string }> = [
  { id: "breakfast", label: "Matin" },
  { id: "lunch", label: "Midi" },
  { id: "snack", label: "Collation" },
  { id: "dinner", label: "Soir" },
];
const origins: Array<{ id: MealOrigin; label: string }> = [
  { id: "homemade", label: "Maison" },
  { id: "prepared", label: "Préparé / acheté" },
  { id: "mixed", label: "Mixte" },
];

const emptySlot = (): SlotState => ({ state: "idle", file: null, origin: null, message: null, photoCount: 0, filled: false });

export function mealQuickSlotIsFilled(meal: QuickMealRecord | null | undefined) {
  return Boolean(meal && (meal.status === "confirmed" || (Array.isArray(meal.photos) && meal.photos.length > 0)));
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
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "La photo n’a pas pu être enregistrée.");
  return body as Record<string, unknown>;
}

async function uploadAndAnalyze(date: string, slot: MealType, file: File, origin: MealOrigin) {
  const key = `quick-${date}-${slot}`;
  const created = await responseJson(await fetch("/api/meals", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ mealDate: date, mealType: slot, status: "draft" }),
  }));
  const meal = created.meal as { id?: unknown } | undefined;
  if (typeof meal?.id !== "string") throw new Error("Le repas n’a pas pu être créé.");
  const form = new FormData();
  form.append("photos", file, file.name);
  form.set("origin", origin);
  const uploadKey = `quick-${date}-${slot}-${file.name}-${file.size}-${file.lastModified}`;
  await responseJson(await fetch(`/api/meals/${encodeURIComponent(meal.id)}/photos`, { method: "POST", headers: { "Idempotency-Key": uploadKey }, body: form }));
  await responseJson(await fetch(`/api/meals/${encodeURIComponent(meal.id)}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: true }),
  }));
}

export function MealQuickCapture({ todayDate, variables, entries, days, breakfastDisabledOverride, morningJournalCompletedOverride }: { todayDate: string; variables: JournalVariable[]; entries: JournalEntry[]; days: JournalDay[]; breakfastDisabledOverride?: boolean; morningJournalCompletedOverride?: boolean }) {
  const breakfastDisabled = breakfastDisabledOverride ?? breakfastIsExplicitlySkipped({ todayDate, variables, entries, days });
  const morningJournalCompleted = morningJournalCompletedOverride ?? morningJournalIsConfirmed({ todayDate, variables, entries, days });
  const inputs = useRef<Partial<Record<MealType, HTMLInputElement | null>>>({});
  const photoButtons = useRef<Partial<Record<MealType, HTMLButtonElement | null>>>({});
  const firstOriginButtons = useRef<Partial<Record<MealType, HTMLButtonElement | null>>>({});
  const submittingSlots = useRef(new Set<MealType>());
  const [slotStates, setSlotStates] = useState<Record<MealType, SlotState>>(() => ({ breakfast: { ...emptySlot(), filled: morningJournalCompleted }, lunch: emptySlot(), dinner: emptySlot(), snack: emptySlot() }));

  useEffect(() => {
    if (!breakfastDisabled) return;
    setSlotStates((current) => current.breakfast.state === "choosing-origin" ? { ...current, breakfast: { ...current.breakfast, state: "idle", file: null, origin: null, message: null } } : current);
  }, [breakfastDisabled]);

  useEffect(() => {
    let active = true;
    fetch(`/api/meals?from=${encodeURIComponent(todayDate)}&to=${encodeURIComponent(todayDate)}`, { cache: "no-store" })
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
          return [id, {
            ...current[id],
            photoCount: counts.has(id) ? counts.get(id) ?? 0 : current[id].photoCount,
            filled: current[id].filled || mealQuickSlotIsFilled(meal) || (id === "breakfast" && morningJournalCompleted),
          }];
        })) as Record<MealType, SlotState>);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [morningJournalCompleted, todayDate]);

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
    try {
      const prepared = await normalizeMealImage(file);
      await uploadAndAnalyze(todayDate, slot, prepared, origin);
      setSlotStates((current) => ({ ...current, [slot]: { state: "done", file: null, origin: null, message: "Analyse prête", photoCount: current[slot].photoCount + 1, filled: true } }));
    } catch (error) {
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
        const buttonLabel = disabled ? "Ignoré" : busy ? "Analyse…" : item.state === "error" ? "Réessayer" : locked ? "Ajouté" : "Photo";
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
