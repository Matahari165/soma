"use client";

import {
  AlertCircle,
  Camera,
  Check,
  ImagePlus,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";
import { MAX_MEAL_PHOTOS } from "@/domain/meals";
import {
  DEFAULT_NUTRITION_TARGETS,
  loadNutritionTargets,
  parseNutritionTargets,
  saveNutritionTargets,
  type NutritionTargets,
} from "@/domain/nutrition-targets";
import { normalizeMealImage } from "@/services/meal-image";
import { MealDayTargets } from "./meal-day-targets";
import styles from "./meal-journal.module.css";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];
export type MealOrigin = "homemade" | "prepared" | "mixed";
export type MealStatus = "draft" | "analyzing" | "review" | "confirmed" | "error";
export type Rating = 0 | 1 | 2 | 3 | 4 | 5;

export type MealPhoto = {
  id: string;
  url: string;
  filename?: string;
  origin: MealOrigin | null;
  storageStatus?: "available" | "purge_pending" | "purged";
  purgedAt?: string | null;
};

export type MealIngredient = {
  id: string;
  name: string;
  portion: string;
  preparation?: string | null;
  estimatedGrams?: number | null;
  calories?: NutritionRange;
  proteinGrams?: NutritionRange;
  carbohydratesGrams?: NutritionRange;
  fatGrams?: NutritionRange;
  fiberGrams?: NutritionRange;
  sugarGrams?: NutritionRange;
  addedSugarGrams?: NutritionRange;
  confidence?: "low" | "medium" | "high";
};

export type NutritionRange = {
  low: number | null;
  likely?: number | null;
  high: number | null;
};

export type MealAnalysis = {
  ingredients: MealIngredient[];
  summary?: string;
  dishType?: string | null;
  calorieAnalysis?: string | null;
  calories: NutritionRange;
  proteinGrams: NutritionRange;
  carbohydratesGrams?: NutritionRange;
  fatGrams?: NutritionRange;
  fiberGrams?: NutritionRange;
  sugarGrams?: NutritionRange;
  addedSugarGrams?: NutritionRange;
  confidence?: "low" | "medium" | "high";
  note?: string;
  uncertainties?: string[];
};

function formatIngredientLabel(ingredient: MealIngredient) {
  const quantity = ingredient.portion.trim();
  const grams = typeof ingredient.estimatedGrams === "number" ? ` · ${Math.round(ingredient.estimatedGrams)} g` : "";
  const preparation = ingredient.preparation?.trim() ? ` · ${ingredient.preparation.trim()}` : "";
  return `${ingredient.name.trim()}${quantity ? ` (${quantity})` : ""}${grams}${preparation}`;
}

export type MealRecord = {
  id: string;
  date: string;
  slot: MealSlot;
  photos: MealPhoto[];
  note: string;
  analysis: MealAnalysis | null;
  mouthHeat: Rating | null;
  stomachLoad: Rating | null;
  status: MealStatus;
  error?: string | null;
  confirmedAt?: string | null;
};

export type MealJournalData = {
  date: string;
  meals: Partial<Record<MealSlot, MealRecord | null>>;
};

export type AnalyzeMealInput = {
  date: string;
  slot: MealSlot;
  meal: MealRecord;
  files: File[];
};

export type MealJournalApi = {
  load?: (date: string) => Promise<MealJournalData>;
  analyze?: (input: AnalyzeMealInput) => Promise<MealRecord>;
  save?: (meal: MealRecord) => Promise<MealRecord>;
  removePhoto?: (mealId: string, photoId: string) => Promise<void>;
};

type Props = {
  date?: string;
  today?: string;
  initialData?: MealJournalData;
  api?: MealJournalApi;
  className?: string;
};

type LoadState = "loading" | "ready" | "error";

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Petit déjeuner",
  lunch: "Déjeuner",
  dinner: "Dîner",
  snack: "Collation",
};

const SLOT_SHORT_LABELS: Record<MealSlot, string> = {
  breakfast: "Matin",
  lunch: "Midi",
  dinner: "Soir",
  snack: "Goûter",
};

const ORIGIN_LABELS: Record<MealOrigin, string> = {
  homemade: "Maison",
  prepared: "Préparé / acheté",
  mixed: "Mixte",
};

const RATING_LABELS = {
  mouthHeat: "Bouche chaude",
  stomachLoad: "Repas qui m'a cassé",
} as const;

function todayInLocalTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function shiftIsoDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mealHistoryDates(selectedDate: string, today = todayInLocalTime()) {
  const end = selectedDate < shiftIsoDate(today, -3) ? shiftIsoDate(selectedDate, 3) : today;
  return Array.from({ length: 7 }, (_, index) => shiftIsoDate(end, index - 6));
}

function compactDayLabel(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return {
    weekday: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(value).replace(".", ""),
    day: new Intl.DateTimeFormat("fr-FR", { day: "numeric" }).format(value),
  };
}

function randomId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyData(date: string): MealJournalData {
  return { date, meals: { breakfast: null, lunch: null, dinner: null, snack: null } };
}

function emptyMeal(date: string, slot: MealSlot): MealRecord {
  return { id: randomId("meal"), date, slot, photos: [], note: "", analysis: null, mouthHeat: null, stomachLoad: null, status: "draft", error: null, confirmedAt: null };
}

function normalizeMeal(raw: MealRecord, date: string, slot: MealSlot): MealRecord {
  return {
    ...emptyMeal(date, slot),
    ...raw,
    date: raw.date || date,
    slot: raw.slot || slot,
    photos: Array.isArray(raw.photos) ? raw.photos.map((photo) => ({ ...photo, origin: photo.origin ?? null })) : [],
    note: typeof raw.note === "string" ? raw.note.slice(0, 500) : "",
    analysis: raw.analysis ? {
      ...raw.analysis,
      ingredients: Array.isArray(raw.analysis.ingredients) ? raw.analysis.ingredients : [],
      calories: raw.analysis.calories ?? { low: null, high: null },
      proteinGrams: raw.analysis.proteinGrams ?? { low: null, high: null },
    } : null,
    mouthHeat: raw.mouthHeat ?? null,
    stomachLoad: raw.stomachLoad ?? null,
    status: raw.status ?? "draft",
  };
}

function normalizeData(raw: MealJournalData, date: string): MealJournalData {
  return {
    date: raw.date || date,
    meals: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, raw.meals?.[slot] ? normalizeMeal(raw.meals[slot] as MealRecord, date, slot) : null])) as MealJournalData["meals"],
  };
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Les repas ne sont pas disponibles pour le moment.");
  return body;
}

async function defaultLoad(date: string) {
  const response = await fetch(`/api/meals?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`, { cache: "no-store" });
  const body = await readJson(response) as { meals?: unknown[] };
  const meals = Array.isArray(body.meals) ? body.meals.map(apiMealToRecord) : [];
  return { date, meals: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, meals.find((meal) => meal.slot === slot) ?? null])) } as MealJournalData;
}

export async function defaultAnalyze({ date, slot, meal, files }: AnalyzeMealInput) {
  let mealId = meal.id;
  const isNewMeal = mealId.startsWith("meal-");
  if (isNewMeal) {
    const createResponse = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": meal.id },
      body: JSON.stringify({ mealDate: date, mealType: slot, status: "draft", ...(meal.note.trim() ? { note: meal.note.trim().slice(0, 500) } : {}) }),
    });
    const created = await readJson(createResponse) as { meal: { id: string } };
    mealId = created.meal.id;
  }
  const newPhotos = meal.photos.filter((photo) => files.some((file) => file === filesByFilename(files, photo.filename)));
  if (!isNewMeal && meal.note.trim()) {
    await readJson(await fetch(`/api/meals/${encodeURIComponent(mealId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: meal.note.trim().slice(0, 500) }) }));
  }
  if (files.length > 0) {
    const origins = newPhotos.map((photo) => photo.origin ?? "unknown");
    if (origins.length !== files.length) throw new Error("Les photos sélectionnées ne correspondent plus au repas.");
    const form = new FormData();
    form.set("origins", JSON.stringify(origins));
    files.forEach((file) => form.append("photos", file, file.name));
    await readJson(await fetch(`/api/meals/${encodeURIComponent(mealId)}/photos`, { method: "POST", body: form }));
  }
  const response = await fetch(`/api/meals/${encodeURIComponent(mealId)}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) });
  const body = await readJson(response);
  return apiMealToRecord(body.meal);
}

async function defaultSave(meal: MealRecord) {
  let mealId = meal.id;
  if (mealId.startsWith("meal-")) {
    const createResponse = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": meal.id },
      body: JSON.stringify({ mealDate: meal.date, mealType: meal.slot, status: "draft", ...(meal.note.trim() ? { note: meal.note.trim().slice(0, 500) } : {}) }),
    });
    const created = await readJson(createResponse) as { meal: { id: string } };
    mealId = created.meal.id;
  }
  const response = await fetch(`/api/meals/${encodeURIComponent(mealId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    status: "confirmed",
    note: meal.note.trim().slice(0, 500),
    mouthWarmthIntensity: serializeRating(meal.mouthHeat),
    stomachOverfullIntensity: serializeRating(meal.stomachLoad),
    ...(meal.analysis ? { confirmedAnalysis: recordAnalysisToApi(meal.analysis) } : {}),
  }) });
  const body = await readJson(response);
  return body.meal ? apiMealToRecord(body.meal) : meal;
}

async function defaultRemovePhoto(mealId: string, photoId: string) {
  await readJson(await fetch(`/api/meals/${encodeURIComponent(mealId)}/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" }));
}

function filesByFilename(files: File[], filename?: string) {
  return filename ? files.find((file) => file.name === filename) : undefined;
}

function serializeRating(value: Rating | null) {
  return value === null ? null : value === 0 ? "none" : value;
}

function apiRange(value: unknown): NutritionRange {
  if (!value || typeof value !== "object") return { low: null, likely: null, high: null };
  const range = value as Record<string, unknown>;
  return {
    low: typeof range.low === "number" ? range.low : null,
    likely: typeof range.likely === "number" ? range.likely : null,
    high: typeof range.high === "number" ? range.high : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isMealOrigin(value: unknown): value is MealOrigin {
  return value === "homemade" || value === "prepared" || value === "mixed";
}

function confidence(value: unknown): MealIngredient["confidence"] {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

export function apiMealToRecord(value: unknown): MealRecord {
  const meal = isRecord(value) ? value : {};
  const analysisRecord = isRecord(meal.analysis) ? meal.analysis : null;
  const successfulRecord = isRecord(meal.lastSuccessfulAnalysis) ? meal.lastSuccessfulAnalysis : null;
  const result = analysisRecord && isRecord(analysisRecord.result)
    ? analysisRecord.result
    : successfulRecord && isRecord(successfulRecord.result)
      ? successfulRecord.result
      : null;
  const resultRecord = analysisRecord && isRecord(analysisRecord.result) ? analysisRecord : successfulRecord;
  const rawPhotos = Array.isArray(meal.photos) ? meal.photos : [];
  const rawFoods = result && Array.isArray(result.foods) ? result.foods : [];
  const totals = result && isRecord(result.totals) ? result.totals : {};
  const ingredients = rawFoods.flatMap((rawFood, index) => {
    if (!isRecord(rawFood)) return [];
    const name = typeof rawFood.name === "string" ? rawFood.name : "";
    if (!name) return [];
    const range = (key: string) => apiRange(rawFood[key]);
    const optionalRange = (key: string) => {
      const value = range(key);
      return value.low === null && value.high === null ? undefined : value;
    };
    return [{
      id: `${resultRecord?.id ?? "analysis"}-${index}`,
      name,
      portion: typeof rawFood.portion === "string" ? rawFood.portion : "",
      preparation: typeof rawFood.preparation === "string" ? rawFood.preparation : null,
      estimatedGrams: typeof rawFood.estimatedGrams === "number" ? rawFood.estimatedGrams : null,
      calories: optionalRange("calories"),
      proteinGrams: optionalRange("proteinGrams"),
      carbohydratesGrams: optionalRange("carbohydrateGrams") ?? optionalRange("carbohydratesGrams"),
      fatGrams: optionalRange("fatGrams"),
      fiberGrams: optionalRange("fiberGrams"),
      sugarGrams: optionalRange("sugarGrams") ?? optionalRange("sugarsGrams") ?? optionalRange("sugars"),
      addedSugarGrams: optionalRange("addedSugarGrams") ?? optionalRange("addedSugarsGrams") ?? optionalRange("addedSugars"),
      confidence: confidence(rawFood.confidence),
    }];
  });
  const uncertainties = result && Array.isArray(result.uncertainties) ? result.uncertainties.filter((item): item is string => typeof item === "string") : [];
  const dishType = result && typeof result.dishType === "string" && result.dishType.trim() ? result.dishType.trim().slice(0, 80) : null;
  const calorieAnalysis = result && typeof result.calorieAnalysis === "string" && result.calorieAnalysis.trim() ? result.calorieAnalysis.trim().slice(0, 500) : null;
  const mealType = meal.mealType === "breakfast" || meal.mealType === "lunch" || meal.mealType === "dinner" || meal.mealType === "snack" ? meal.mealType : "lunch";
  const rawStatus = meal.status;
  const analysisStatus = analysisRecord?.status;
  return {
    id: typeof meal.id === "string" ? meal.id : randomId("meal"),
    date: typeof meal.mealDate === "string" ? meal.mealDate : todayInLocalTime(),
    slot: mealType,
    note: typeof meal.note === "string" ? meal.note.slice(0, 500) : "",
    photos: rawPhotos.flatMap((rawPhoto) => {
      if (!isRecord(rawPhoto) || typeof rawPhoto.id !== "string") return [];
      return [{
        id: rawPhoto.id,
        url: typeof rawPhoto.url === "string" ? rawPhoto.url : "",
        filename: typeof rawPhoto.filename === "string" ? rawPhoto.filename : undefined,
        origin: isMealOrigin(rawPhoto.origin) ? rawPhoto.origin : null,
        storageStatus: rawPhoto.storageStatus === "purged" || rawPhoto.storageStatus === "purge_pending" ? rawPhoto.storageStatus : "available",
        purgedAt: typeof rawPhoto.purgedAt === "string" ? rawPhoto.purgedAt : null,
      }];
    }),
    analysis: result ? {
      ingredients,
      summary: result && typeof result.summary === "string" ? result.summary : undefined,
      dishType,
      calorieAnalysis,
      calories: apiRange(totals.calories),
      proteinGrams: apiRange(totals.proteinGrams),
      carbohydratesGrams: apiRange(totals.carbohydrateGrams),
      fatGrams: apiRange(totals.fatGrams),
      fiberGrams: apiRange(totals.fiberGrams),
      sugarGrams: apiRange(totals.sugarGrams ?? totals.sugarsGrams ?? totals.sugars),
      addedSugarGrams: apiRange(totals.addedSugarGrams ?? totals.addedSugarsGrams ?? totals.addedSugars),
      confidence: confidence(result.confidence),
      note: uncertainties.length ? uncertainties.join(" · ") : typeof result.summary === "string" ? result.summary : undefined,
    } : null,
    mouthHeat: typeof meal.mouthWarmthIntensity === "number" && meal.mouthWarmthIntensity >= 0 && meal.mouthWarmthIntensity <= 5 ? meal.mouthWarmthIntensity as Rating : null,
    stomachLoad: typeof meal.stomachOverfullIntensity === "number" && meal.stomachOverfullIntensity >= 0 && meal.stomachOverfullIntensity <= 5 ? meal.stomachOverfullIntensity as Rating : null,
    status: rawStatus === "confirmed" ? "confirmed" : result ? "review" : analysisStatus === "failed" ? "error" : "draft",
    error: typeof analysisRecord?.error === "string" ? analysisRecord.error : null,
    confirmedAt: rawStatus === "confirmed" && typeof meal.updatedAt === "string" ? meal.updatedAt : null,
  };
}

function normalizedApiRange(range: NutritionRange | undefined) {
  if (!range || range.low === null || range.high === null) return null;
  const low = Math.min(range.low, range.high);
  const high = Math.max(range.low, range.high);
  const likely = typeof range.likely === "number" && range.likely >= low && range.likely <= high ? range.likely : (low + high) / 2;
  return { low, likely, high };
}

function recordAnalysisToApi(analysis: MealAnalysis) {
  const calories = normalizedApiRange(analysis.calories);
  const proteinGrams = normalizedApiRange(analysis.proteinGrams);
  return {
    summary: "Analyse relue et confirmée.",
    dishType: analysis.dishType?.trim() ? analysis.dishType.trim().slice(0, 80) : null,
    calorieAnalysis: analysis.calorieAnalysis?.trim() ? analysis.calorieAnalysis.trim().slice(0, 500) : null,
    foods: analysis.ingredients.filter((ingredient) => ingredient.name.trim()).map((ingredient) => ({ name: ingredient.name.trim(), preparation: ingredient.preparation?.trim() || null, portion: ingredient.portion.trim() || null, estimatedGrams: ingredient.estimatedGrams ?? null, calories: normalizedApiRange(ingredient.calories), proteinGrams: normalizedApiRange(ingredient.proteinGrams), carbohydrateGrams: normalizedApiRange(ingredient.carbohydratesGrams), fatGrams: normalizedApiRange(ingredient.fatGrams), fiberGrams: normalizedApiRange(ingredient.fiberGrams), sugarGrams: normalizedApiRange(ingredient.sugarGrams), addedSugarGrams: normalizedApiRange(ingredient.addedSugarGrams), confidence: ingredient.confidence ?? "medium" })),
    totals: { calories, proteinGrams, carbohydrateGrams: normalizedApiRange(analysis.carbohydratesGrams), fatGrams: normalizedApiRange(analysis.fatGrams), fiberGrams: normalizedApiRange(analysis.fiberGrams), sugarGrams: normalizedApiRange(analysis.sugarGrams), addedSugarGrams: normalizedApiRange(analysis.addedSugarGrams) },
    confidence: analysis.confidence ?? "medium",
    uncertainties: analysis.note ? [analysis.note.slice(0, 300)] : [],
  };
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
}

function formatRange(range: NutritionRange | undefined, unit: string) {
  if (!range || (range.low === null && range.high === null)) return "—";
  if (range.low === range.high || range.high === null) return `${range.low ?? range.high} ${unit}`;
  if (range.low === null) return `≤ ${range.high} ${unit}`;
  return `${range.low}–${range.high} ${unit}`;
}

function formatLowHigh(range: NutritionRange | undefined) {
  if (!range || (range.low === null && range.high === null)) return "—";
  return formatRange(range, "").trim();
}

function likelyOf(range: NutritionRange | undefined): number | null {
  return typeof range?.likely === "number" ? range.likely : null;
}

function likelyLabel(range: NutritionRange | undefined) {
  const likely = likelyOf(range);
  if (likely !== null) return `${likely}`;
  if (range?.low !== null && range?.low !== undefined) return `${range.low}`;
  if (range?.high !== null && range?.high !== undefined) return `${range.high}`;
  return "—";
}

type DayTotal = { calories: number | null; protein: number | null; fat: number | null; carbs: number | null; fiber: number | null };

function sumLikelyDay(meals: MealJournalData["meals"]): DayTotal | null {
  const confirmed = MEAL_SLOTS.map((slot) => meals[slot]).filter((meal): meal is MealRecord => meal !== null && meal !== undefined && meal.status === "confirmed");
  if (confirmed.length === 0) return null;
  let calories: number | null = 0;
  let protein: number | null = 0;
  let fat: number | null = 0;
  let carbs: number | null = 0;
  let fiber: number | null = 0;
  for (const meal of confirmed) {
    const analysis = meal.analysis;
    const add = (total: number | null, value: number | null) => total === null || value === null ? null : total + value;
    calories = add(calories, likelyOf(analysis?.calories));
    protein = add(protein, likelyOf(analysis?.proteinGrams));
    fat = add(fat, likelyOf(analysis?.fatGrams));
    carbs = add(carbs, likelyOf(analysis?.carbohydratesGrams));
    fiber = add(fiber, likelyOf(analysis?.fiberGrams));
  }
  return {
    calories: calories === null ? null : Math.round(calories),
    protein: protein === null ? null : Math.round(protein),
    fat: fat === null ? null : Math.round(fat),
    carbs: carbs === null ? null : Math.round(carbs),
    fiber: fiber === null ? null : Math.round(fiber),
  };
}

function statusLabel(meal: MealRecord | null) {
  if (!meal) return "";
  if (meal.status === "analyzing") return "Analyse…";
  if (meal.status === "review") return "À relire";
  if (meal.status === "confirmed") return "Confirmé";
  if (meal.status === "error") return "À réessayer";
  if (meal.photos.some((photo) => photo.storageStatus !== "purged")) return "Photos à analyser";
  if (meal.note.trim()) return "Texte à compléter";
  return "";
}

function visibleAnalysisError(message: string | null | undefined) {
  return message?.replace(/Grok/gi, "le service d’analyse") ?? "L’analyse n’a pas abouti. Vérifie ta connexion puis réessaie.";
}

function MealTextInput({ slot, meal, disabled, onNote }: { slot: MealSlot; meal: MealRecord | null; disabled: boolean; onNote: (note: string) => void }) {
  return <div className={styles.textInput}>
    <label className={styles.visuallyHidden} htmlFor={`meal-${slot}-note`}>Décrire le {SLOT_LABELS[slot]}</label>
    <textarea id={`meal-${slot}-note`} rows={3} value={meal?.note ?? ""} maxLength={500} placeholder="Ex. 2 bananes et un café." disabled={disabled} onChange={(event) => onNote(event.target.value)} />
  </div>;
}

function PhotoOriginPicker({ photo, onChange }: { photo: MealPhoto; onChange: (origin: MealOrigin) => void }) {
  return <fieldset className={styles.originFieldset}>
    <legend>Origine de la photo</legend>
    <div className={styles.originChoices}>
      {(Object.keys(ORIGIN_LABELS) as MealOrigin[]).map((origin) => <button className={photo.origin === origin ? styles.originChoiceSelected : styles.originChoice} type="button" key={origin} aria-pressed={photo.origin === origin} onClick={() => onChange(origin)}>{ORIGIN_LABELS[origin]}</button>)}
    </div>
  </fieldset>;
}

function RatingScale({ label, value, onChange }: { label: string; value: Rating | null; onChange: (next: Rating) => void }) {
  return <fieldset className={styles.ratingFieldset}>
    <legend>{label}</legend>
    <div className={styles.ratingScale}>
      <button className={value === 0 ? styles.ratingSelected : styles.ratingChoice} type="button" aria-pressed={value === 0} onClick={() => onChange(0)}>Aucune</button>
      {[1, 2, 3, 4, 5].map((rating) => <button className={value === rating ? styles.ratingSelected : styles.ratingChoice} type="button" aria-pressed={value === rating} onClick={() => onChange(rating as Rating)} key={rating}>{rating}</button>)}
    </div>
  </fieldset>;
}

function AnalysisDisplay({ meal }: { meal: MealRecord }) {
  const analysis = meal.analysis;
  if (!analysis) return null;
  const nutritionMetrics = [
    { label: "Calories", unit: "kcal", range: analysis.calories },
    { label: "Protéines", unit: "g", range: analysis.proteinGrams },
    { label: "Lipides", unit: "g", range: analysis.fatGrams },
    { label: "Glucides", unit: "g", range: analysis.carbohydratesGrams },
    { label: "Fibres", unit: "g", range: analysis.fiberGrams },
    ...(analysis.sugarGrams ? [{ label: "Sucres", unit: "g", range: analysis.sugarGrams }] : []),
  ];
  return <div className={styles.analysisDisplay}>
    {analysis.dishType && <p className={styles.dishType}><strong>{analysis.dishType}</strong></p>}
    <div className={styles.confirmedNutrition}>
      {nutritionMetrics.map(({ label, unit, range }) => <span key={label} aria-label={`${label} : ${likelyLabel(range)} ${unit}, estimation ${formatLowHigh(range)}`} title={`Estimation ${formatLowHigh(range)} ${unit}`}><small>{label}</small><strong>{likelyLabel(range)} <small>{unit}</small></strong></span>)}
    </div>
    {analysis.ingredients.length > 0
      ? <ul className={styles.ingredientsList}>{analysis.ingredients.map((ingredient) => <li key={ingredient.id}><strong>{formatIngredientLabel(ingredient)}</strong>{(ingredient.calories || ingredient.proteinGrams || ingredient.carbohydratesGrams || ingredient.fatGrams || ingredient.fiberGrams || ingredient.sugarGrams || ingredient.addedSugarGrams) && <small>{ingredient.calories && `${likelyLabel(ingredient.calories)} kcal`}{ingredient.proteinGrams && ` · ${likelyLabel(ingredient.proteinGrams)} g prot.`}{ingredient.carbohydratesGrams && ` · ${likelyLabel(ingredient.carbohydratesGrams)} g gluc.`}{ingredient.fatGrams && ` · ${likelyLabel(ingredient.fatGrams)} g lip.`}{ingredient.fiberGrams && ` · ${likelyLabel(ingredient.fiberGrams)} g fibres`}{ingredient.sugarGrams && ` · ${likelyLabel(ingredient.sugarGrams)} g sucres`}{ingredient.addedSugarGrams && ` · ${likelyLabel(ingredient.addedSugarGrams)} g sucres ajoutés`}</small>}</li>)}</ul>
      : <p className={styles.ingredientsList}>Composition non détaillée</p>}
    {analysis.uncertainties && analysis.uncertainties.length > 0 && <details className={styles.uncertaintiesDetails}><summary>Incertitudes ({analysis.uncertainties.length})</summary><ul className={styles.uncertainties}>{analysis.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul></details>}
  </div>;
}

function MealCompletionControls({ meal, status, saving, mutationBusy, onEdit, onConfirm, onRating }: {
  meal: MealRecord;
  status: "review" | "confirmed";
  saving: boolean;
  mutationBusy: boolean;
  onEdit: () => void;
  onConfirm: () => void;
  onRating: (key: "mouthHeat" | "stomachLoad", value: Rating | null) => void;
}) {
  return <div className={styles.mealCompletionControls}>
    <details className={styles.ratingsDetails}>
      <summary>Ressentis</summary>
      <div className={styles.ratings}><RatingScale label={RATING_LABELS.mouthHeat} value={meal.mouthHeat} onChange={(value) => onRating("mouthHeat", value)} /><RatingScale label={RATING_LABELS.stomachLoad} value={meal.stomachLoad} onChange={(value) => onRating("stomachLoad", value)} /></div>
    </details>
    <div className={styles.reviewActions}>
      <button className={styles.secondaryButton} type="button" disabled={mutationBusy} onClick={onEdit}>Modifier</button>
      {status === "review" && <button className={styles.confirmButton} type="button" disabled={mutationBusy} onClick={onConfirm}>{saving ? <LoaderCircle className={styles.spin} size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}Confirmer</button>}
    </div>
  </div>;
}

function PhotoInput({ slot, onFiles, disabled = false }: { slot: MealSlot; onFiles: (files: File[]) => void | Promise<void>; disabled?: boolean }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const readFiles = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")));
    event.target.value = "";
  };
  return <div className={styles.photoInput}>
    <input ref={cameraRef} className={styles.visuallyHidden} tabIndex={-1} aria-hidden="true" type="file" accept="image/*" capture="environment" aria-label={`Prendre une photo pour le ${SLOT_LABELS[slot]}`} disabled={disabled} onChange={readFiles} />
    <input ref={galleryRef} className={styles.visuallyHidden} tabIndex={-1} aria-hidden="true" type="file" accept="image/*" multiple aria-label={`Choisir des photos pour le ${SLOT_LABELS[slot]}`} disabled={disabled} onChange={readFiles} />
    <button className={styles.captureButton} type="button" disabled={disabled} onClick={() => cameraRef.current?.click()}><Camera size={17} aria-hidden="true" />Prendre une photo</button>
    <button className={styles.galleryButton} type="button" disabled={disabled} onClick={() => galleryRef.current?.click()}><ImagePlus size={17} aria-hidden="true" />Choisir dans Photos</button>
  </div>;
}

function PhotoStrip({ meal, onRemove, onOrigin, disabled }: { meal: MealRecord; onRemove: (photoId: string) => void; onOrigin: (photoId: string, origin: MealOrigin) => void; disabled: boolean }) {
  const availablePhotos = meal.photos.filter((photo) => photo.storageStatus !== "purged");
  return <div className={styles.photoGrid} role="list" aria-label={`${availablePhotos.length} photo${availablePhotos.length > 1 ? "s" : ""} du repas`}>
    {availablePhotos.map((photo, index) => <figure className={styles.photo} role="listitem" key={photo.id}>
      <div className={styles.photoFrame}>
        {/* User-selected blob URLs and authenticated photo routes cannot use next/image's static loader. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={`Photo ${index + 1} du repas`} width={360} height={280} loading="lazy" decoding="async" />
        <button className={styles.photoRemove} type="button" disabled={disabled} onClick={() => onRemove(photo.id)} aria-label={`Retirer la photo ${index + 1}`}><X size={15} aria-hidden="true" /></button>
      </div>
      <figcaption><span>Photo {index + 1}</span><PhotoOriginPicker photo={photo} onChange={(origin) => onOrigin(photo.id, origin)} /></figcaption>
    </figure>)}
  </div>;
}

function MealCard({ meal, slot, saving, processingFiles, mutationBusy, onFiles, onRemovePhoto, onOrigin, onAnalyze, onEdit, onConfirm, onRating, onRetry, onNote, confirmError }: {
  meal: MealRecord | null;
  slot: MealSlot;
  saving: boolean;
  processingFiles: boolean;
  mutationBusy: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
  onRemovePhoto: (photoId: string) => void;
  onOrigin: (photoId: string, origin: MealOrigin) => void;
  onAnalyze: () => void;
  onEdit: () => void;
  onConfirm: () => void;
  onRating: (key: "mouthHeat" | "stomachLoad", value: Rating | null) => void;
  onRetry: () => void;
  onNote: (note: string) => void;
  confirmError?: string | null;
}) {
  const headingId = `meal-${slot}-title`;
  const hasPhotos = Boolean(meal && meal.photos.some((photo) => photo.storageStatus !== "purged"));
  const hasNote = Boolean(meal?.note.trim());
  const status = meal?.status ?? "draft";
  const canAnalyze = Boolean(meal) && (hasPhotos || hasNote) && status === "draft";
  const visibleStatus = meal ? statusLabel(meal) : "";
  return <article className={`${styles.mealCard} ${meal?.status === "confirmed" ? styles.mealCardConfirmed : ""}`} aria-labelledby={headingId} aria-busy={saving || processingFiles}>
    <header className={styles.mealHeader}>
      <div className={styles.mealTitle}><span className={styles.mealIndex}>{MEAL_SLOTS.indexOf(slot) + 1}</span><div><span className={styles.eyebrow}>{SLOT_SHORT_LABELS[slot]}</span><h3 id={headingId}>{SLOT_LABELS[slot]}</h3></div></div>
      {visibleStatus && <span className={styles.mealStatus} data-status={meal?.status ?? "empty"}>{meal?.status === "confirmed" ? <Check size={14} aria-hidden="true" /> : null}{visibleStatus}</span>}
    </header>
    {status === "analyzing" && <div className={styles.analyzingState} role="status" aria-live="polite"><LoaderCircle className={styles.spin} size={22} aria-hidden="true" /><strong>Analyse en cours</strong></div>}
    {status !== "analyzing" && <div className={`${styles.mealBody} ${status === "draft" ? styles.draftMeal : ""}`}>
      {hasPhotos && status !== "confirmed" && <PhotoStrip meal={meal as MealRecord} onRemove={onRemovePhoto} onOrigin={onOrigin} disabled={mutationBusy} />}
      {status !== "confirmed" && <MealTextInput slot={slot} meal={meal} disabled={processingFiles || mutationBusy} onNote={onNote} />}
      {status === "draft" && <div className={styles.actionsRow}>
        <PhotoInput slot={slot} onFiles={onFiles} disabled={processingFiles} />
        <button className={styles.analyzeButton} type="button" disabled={!canAnalyze || processingFiles || mutationBusy} onClick={onAnalyze}>
          <Sparkles size={17} aria-hidden="true" />Analyser
        </button>
      </div>}
      {status === "error" && <div className={styles.errorState} role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Analyse interrompue</strong><span>{visibleAnalysisError(meal?.error)}</span></div><button className={styles.retryButton} type="button" disabled={mutationBusy} onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Réessayer</button></div>}
      {status === "review" && meal?.analysis && <><AnalysisDisplay meal={meal} />{confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}<MealCompletionControls meal={meal} status="review" saving={saving} mutationBusy={mutationBusy} onEdit={onEdit} onConfirm={onConfirm} onRating={onRating} /></>}
      {status === "confirmed" && meal && <><AnalysisDisplay meal={meal} /><MealCompletionControls meal={meal} status="confirmed" saving={saving} mutationBusy={mutationBusy} onEdit={onEdit} onConfirm={onConfirm} onRating={onRating} /></>}
      {(status === "review" || status === "confirmed") && meal?.error && <p className={styles.confirmError} role="status">Réanalyse interrompue. L’analyse précédente reste conservée.</p>}
    </div>}
  </article>;
}

function MealPageHeader({ totals, targets }: { totals: DayTotal | null; targets: NutritionTargets }) {
  const calories = totals?.calories ?? null;
  const calorieTarget = targets.caloriesKcal.likely;
  const protein = totals?.protein ?? null;
  const proteinTarget = targets.proteinG.likely;
  const calorieProgress = calories === null || calorieTarget <= 0 ? 0 : Math.min(100, Math.max(0, calories / calorieTarget * 100));
  const calorieProgressValue = calories === null ? null : Math.round(calorieProgress);

  return <header className={styles.pageHeader}>
    <div><h1 id="meal-journal-title">Repas</h1></div>
    <div className={styles.dayProgress} aria-label={`Calories : ${calories ?? "indisponibles"} sur ${calorieTarget} kilocalories. Protéines : ${protein ?? "indisponibles"} sur ${proteinTarget} grammes.`}>
      <ScoreRing kind="recovery" label="% calories" score={calorieProgressValue} decorative animate />
    </div>
  </header>;
}

export function MealJournal({ date, today: providedToday, initialData, api, className }: Props) {
  const today = providedToday ?? todayInLocalTime();
  const requestedDate = date ?? today;
  const initialDate = requestedDate > today ? today : requestedDate;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [data, setData] = useState<MealJournalData | null>(() => initialData ? normalizeData(initialData, initialDate) : null);
  const [loadState, setLoadState] = useState<LoadState>(initialData ? "ready" : "loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filesByPhotoId, setFilesByPhotoId] = useState<Record<string, File>>({});
  const [processingFiles, setProcessingFiles] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<Partial<Record<MealSlot, string | null>>>({});
  const [savingSlot, setSavingSlot] = useState<MealSlot | null>(null);
  const [targets, setTargets] = useState<NutritionTargets>(DEFAULT_NUTRITION_TARGETS);
  const [targetsExpanded, setTargetsExpanded] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const objectUrls = useRef(new Set<string>());
  const targetSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRequestId = useRef(0);
  const mutationInFlight = useRef(false);
  const navigationDisabled = processingFiles || deletingPhotoId !== null || savingSlot !== null || Object.values(data?.meals ?? {}).some((meal) => meal?.status === "analyzing");

  const selectDate = useCallback((nextDate: string) => {
    if (navigationDisabled || mutationInFlight.current) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate > today) return;
    if (nextDate === selectedDate) return;
    loadRequestId.current += 1;
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    setFilesByPhotoId({});
    setFileError(null);
    setConfirmError({});
    setLoadState("loading");
    setSelectedDate(nextDate);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextDate === today) url.searchParams.delete("date");
      else url.searchParams.set("date", nextDate);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [navigationDisabled, selectedDate, today]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoadState("loading");
    setLoadError(null);
    try {
      const loaded = await (api?.load ? api.load(selectedDate) : defaultLoad(selectedDate));
      if (requestId !== loadRequestId.current) return;
      setData(normalizeData(loaded, selectedDate));
      setLoadState("ready");
    } catch (error) {
      if (requestId !== loadRequestId.current) return;
      setLoadState("error");
      setLoadError(error instanceof Error ? error.message : "Les repas ne sont pas disponibles pour le moment.");
    }
  }, [api, selectedDate]);

  useEffect(() => {
    if (initialData && selectedDate === initialDate) {
      setData(normalizeData(initialData, selectedDate));
      setLoadState("ready");
      return;
    }
    void load();
  }, [initialData, initialDate, load, selectedDate]);

  useEffect(() => () => { objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  useEffect(() => {
    const localTargets = loadNutritionTargets();
    setTargets(localTargets);
    const controller = new AbortController();
    void fetch("/api/nutrition-targets", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Les objectifs nutritionnels ne sont pas disponibles.");
        const parsed = parseNutritionTargets(body.targets);
        if (parsed) {
          const hasCustomizedLocalTargets = JSON.stringify(localTargets) !== JSON.stringify(DEFAULT_NUTRITION_TARGETS);
          if (body.persisted === false && hasCustomizedLocalTargets) {
            const migrated = await fetch("/api/nutrition-targets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets: localTargets }), signal: controller.signal });
            if (!migrated.ok) throw new Error("Les objectifs locaux n’ont pas pu être synchronisés.");
            setTargets(localTargets);
            return;
          }
          setTargets(parsed);
          saveNutritionTargets(parsed);
        }
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setTargetError("Objectifs locaux utilisés : la synchronisation Soma est indisponible.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    if (targetSaveTimer.current) clearTimeout(targetSaveTimer.current);
  }, []);

  const updateTargetLikely = useCallback((key: "caloriesKcal" | "proteinG" | "fatG" | "carbsG" | "fiberG", raw: string) => {
    const value = raw === "" ? null : Number(raw);
    setTargets((current) => {
      if (value === null || !Number.isFinite(value) || value < 0) return current;
      const range = current[key];
      const next = {
        ...current,
        [key]: {
          low: Math.max(0, value - (range.likely - range.low)),
          likely: value,
          high: value + (range.high - range.likely),
        },
      };
      saveNutritionTargets(next);
      if (targetSaveTimer.current) clearTimeout(targetSaveTimer.current);
      targetSaveTimer.current = setTimeout(() => {
        void fetch("/api/nutrition-targets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets: next }) })
          .then(async (response) => {
            if (!response.ok) throw new Error();
            setTargetError(null);
          })
          .catch(() => setTargetError("Modification conservée sur cet appareil, mais pas encore synchronisée avec Soma."));
      }, 500);
      return next;
    });
  }, []);

  const updateMeal = useCallback((slot: MealSlot, update: (meal: MealRecord) => MealRecord) => {
    setData((current) => {
      const next = current ?? emptyData(selectedDate);
      const meal = next.meals[slot] ?? emptyMeal(selectedDate, slot);
      return { ...next, meals: { ...next.meals, [slot]: update(meal) } };
    });
  }, [selectedDate]);

  const addFiles = async (slot: MealSlot, incoming: File[]) => {
    if (!incoming.length || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setProcessingFiles(true);
    setFileError(null);
    let prepared: File[];
    try {
      prepared = await Promise.all(incoming.map((file) => normalizeMealImage(file)));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Cette photo n’a pas pu être préparée. Prends-la à nouveau en JPEG ou PNG.");
      setProcessingFiles(false);
      mutationInFlight.current = false;
      return;
    }
    setData((current) => {
      const next = current ?? emptyData(selectedDate);
      const meal = next.meals[slot] ?? emptyMeal(selectedDate, slot);
      const activePhotoCount = meal.photos.filter((photo) => photo.storageStatus !== "purged").length;
      const remaining = Math.max(0, MAX_MEAL_PHOTOS - activePhotoCount);
      const accepted = prepared.slice(0, remaining);
      const newPhotos = accepted.map((file) => {
        const id = randomId("photo");
        const url = URL.createObjectURL(file);
        objectUrls.current.add(url);
        // L’origine reste inconnue tant que l’utilisateur ne l’a pas choisie.
        return { id, url, filename: file.name, origin: null } satisfies MealPhoto;
      });
      if (accepted.length === 0) return next;
      setFilesByPhotoId((files) => ({ ...files, ...Object.fromEntries(newPhotos.map((photo, index) => [photo.id, accepted[index]])) }));
      return { ...next, meals: { ...next.meals, [slot]: { ...meal, photos: [...meal.photos, ...newPhotos], status: "draft", error: null } } };
    });
    setProcessingFiles(false);
    mutationInFlight.current = false;
  };

  const removePhotoFromState = (slot: MealSlot, photoId: string) => {
    setData((current) => {
      if (!current?.meals[slot]) return current;
      const meal = current.meals[slot] as MealRecord;
      const photo = meal.photos.find((item) => item.id === photoId);
      if (!photo) return current;
      if (photo && objectUrls.current.has(photo.url)) {
        URL.revokeObjectURL(photo.url);
        objectUrls.current.delete(photo.url);
      }
      const photos = meal.photos.filter((item) => item.id !== photoId);
      setFilesByPhotoId((files) => { const next = { ...files }; delete next[photoId]; return next; });
      return { ...current, meals: { ...current.meals, [slot]: photos.length || meal.note.trim() || meal.analysis ? { ...meal, photos, status: "draft", error: null } : null } };
    });
  };

  const removePhoto = async (slot: MealSlot, photoId: string) => {
    const meal = data?.meals[slot];
    if (!meal || mutationInFlight.current) return;
    const localPhoto = Boolean(filesByPhotoId[photoId]) || meal.id.startsWith("meal-");
    mutationInFlight.current = true;
    setDeletingPhotoId(photoId);
    if (!localPhoto) {
      if (typeof window !== "undefined" && !window.confirm("Supprimer cette photo du repas ?")) {
        mutationInFlight.current = false;
        setDeletingPhotoId(null);
        return;
      }
      try {
        await (api?.removePhoto ? api.removePhoto(meal.id, photoId) : defaultRemovePhoto(meal.id, photoId));
      } catch (error) {
        setFileError(error instanceof Error ? error.message : "Cette photo n’a pas pu être supprimée.");
        mutationInFlight.current = false;
        setDeletingPhotoId(null);
        return;
      }
    }
    removePhotoFromState(slot, photoId);
    mutationInFlight.current = false;
    setDeletingPhotoId(null);
  };

  const setNote = (slot: MealSlot, note: string) => {
    updateMeal(slot, (current) => ({ ...current, note: note.slice(0, 500), error: null }));
  };

  const saveMeal = async (meal: MealRecord, status: MealStatus = "confirmed") => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setSavingSlot(meal.slot);
    setConfirmError((previous) => ({ ...previous, [meal.slot]: null }));
    try {
      const saved = await (api?.save ? api.save({ ...meal, status }) : defaultSave({ ...meal, status }));
      const nextMeal = normalizeMeal({ ...meal, ...saved, note: typeof saved.note === "string" ? saved.note : meal.note, status }, selectedDate, meal.slot);
      setData((current) => current ? { ...current, meals: { ...current.meals, [meal.slot]: nextMeal } } : current);
    } catch (error) {
      setConfirmError((previous) => ({ ...previous, [meal.slot]: error instanceof Error ? error.message : "Le repas n’a pas pu être enregistré." }));
      updateMeal(meal.slot, (current) => ({ ...current, status: current.analysis ? "review" : "draft", error: error instanceof Error ? error.message : "Le repas n’a pas pu être enregistré." }));
    } finally {
      mutationInFlight.current = false;
      setSavingSlot(null);
    }
  };

  const analyzeMeal = async (slot: MealSlot) => {
    const meal = data?.meals[slot];
    if (!meal || mutationInFlight.current) return;
    const activePhotos = meal.photos.filter((photo) => photo.storageStatus !== "purged");
    const hasPhotosForAnalyze = activePhotos.length > 0;
    const hasNoteForAnalyze = Boolean(meal.note.trim());
    if (hasPhotosForAnalyze) {
      if (activePhotos.length > MAX_MEAL_PHOTOS) return;
    } else if (!hasNoteForAnalyze) return;
    mutationInFlight.current = true;
    updateMeal(slot, (current) => ({ ...current, status: "analyzing", error: null }));
    try {
      const files = meal.photos.map((photo) => filesByPhotoId[photo.id]).filter((file): file is File => Boolean(file));
      const analyzed = await (api?.analyze ? api.analyze({ date: selectedDate, slot, meal, files }) : defaultAnalyze({ date: selectedDate, slot, meal, files }));
      updateMeal(slot, (current) => ({ ...current, ...normalizeMeal({ ...analyzed, note: typeof analyzed.note === "string" && analyzed.note ? analyzed.note : current.note, photos: analyzed.photos?.length ? analyzed.photos : current.photos, status: "review", error: null }, selectedDate, slot), status: "review" }));
    } catch (error) {
      updateMeal(slot, (current) => ({ ...current, status: "error", error: error instanceof Error ? error.message : "L’analyse n’a pas pu aboutir." }));
    } finally {
      mutationInFlight.current = false;
    }
  };

  const setRating = (slot: MealSlot, key: "mouthHeat" | "stomachLoad", value: Rating | null) => {
    if (mutationInFlight.current) return;
    const meal = data?.meals[slot];
    if (!meal) return;
    const next = { ...meal, [key]: value } as MealRecord;
    updateMeal(slot, () => next);
    if (next.mouthHeat !== null && next.stomachLoad !== null) {
      setConfirmError((previous) => previous[slot] ? { ...previous, [slot]: null } : previous);
    }
    if (meal.status === "confirmed") void saveMeal(next);
  };

  const handleConfirm = (slot: MealSlot, meal: MealRecord) => {
    if (!meal.analysis) {
      setConfirmError((previous) => ({ ...previous, [slot]: "Analyse le repas (photo ou texte) avant de valider." }));
      return;
    }
    // Ressentis optionnels : ne plus bloquer la validation
    setConfirmError((previous) => ({ ...previous, [slot]: null }));
    void saveMeal(meal);
  };

  const historyDates = mealHistoryDates(selectedDate, today);
  const dateNavigation = <nav className={styles.historyNavigation} aria-label="Historique des repas">
    <div className={styles.weekStrip} role="group" aria-label="Sept jours">
      {historyDates.map((historyDate) => {
        const label = compactDayLabel(historyDate);
        return <button key={historyDate} type="button" disabled={navigationDisabled} className={historyDate === selectedDate ? styles.weekDaySelected : styles.weekDay} aria-pressed={historyDate === selectedDate} aria-label={formatDate(historyDate)} onClick={() => selectDate(historyDate)}><span>{label.weekday}</span><strong>{label.day}</strong></button>;
      })}
    </div>
  </nav>;

  if (loadState === "loading") return <section className={`${styles.root} ${className ?? ""}`} aria-labelledby="meal-journal-title"><MealPageHeader totals={null} targets={targets} />{dateNavigation}<div className={styles.loadingState} role="status" aria-live="polite"><LoaderCircle className={styles.spin} size={21} aria-hidden="true" /><span>Chargement des repas…</span></div></section>;
  if (loadState === "error") return <section className={`${styles.root} ${className ?? ""}`} aria-labelledby="meal-journal-title"><MealPageHeader totals={null} targets={targets} />{dateNavigation}<div className={styles.errorState} role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Impossible de charger les repas</strong><span>{loadError}</span></div><button className={styles.retryButton} type="button" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" />Réessayer</button></div></section>;

  const readyData = data ?? emptyData(selectedDate);
  const dayTotal = sumLikelyDay(readyData.meals);
  return <section className={`${styles.root} ${className ?? ""}`} aria-labelledby="meal-journal-title">
    <MealPageHeader totals={dayTotal} targets={targets} />
    {dateNavigation}
    <MealDayTargets totals={dayTotal ? { caloriesKcal: dayTotal.calories, proteinG: dayTotal.protein, fatG: dayTotal.fat, carbsG: dayTotal.carbs, fiberG: dayTotal.fiber } : null} targets={targets} headerAction={<button className={styles.targetEditButton} type="button" aria-label="Modifier les cibles du jour" aria-expanded={targetsExpanded} aria-controls="meal-target-editor" onClick={() => setTargetsExpanded((expanded) => !expanded)}><Pencil size={16} aria-hidden="true" /></button>} />
    {targetsExpanded && <div id="meal-target-editor" className={styles.targetEditor}>
      <label><span>Calories (kcal)</span><input type="number" min="0" inputMode="numeric" aria-label="Cible calories likely" value={targets.caloriesKcal.likely} onChange={(event) => updateTargetLikely("caloriesKcal", event.target.value)} /></label>
      <label><span>Protéines (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible protéines likely" value={targets.proteinG.likely} onChange={(event) => updateTargetLikely("proteinG", event.target.value)} /></label>
      <label><span>Lipides (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible lipides likely" value={targets.fatG.likely} onChange={(event) => updateTargetLikely("fatG", event.target.value)} /></label>
      <label><span>Glucides (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible glucides likely" value={targets.carbsG.likely} onChange={(event) => updateTargetLikely("carbsG", event.target.value)} /></label>
      <label><span>Fibres (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible fibres likely" value={targets.fiberG.likely} onChange={(event) => updateTargetLikely("fiberG", event.target.value)} /></label>
    </div>}
    {targetError && <p className={styles.confirmError} role="status">{targetError}</p>}
    {fileError && <div className={styles.fileError} role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{fileError}</span><button className={styles.dismissError} type="button" onClick={() => setFileError(null)} aria-label="Fermer le message photo"><X size={16} aria-hidden="true" /></button></div>}
    <div className={styles.mealList}>{MEAL_SLOTS.map((slot) => {
      const meal = readyData.meals[slot] ?? null;
      return <div id={`meal-${slot}`} key={slot}><MealCard meal={meal} slot={slot} saving={savingSlot === slot} processingFiles={processingFiles} mutationBusy={navigationDisabled} confirmError={confirmError[slot]} onFiles={(files) => addFiles(slot, files)} onRemovePhoto={(photoId) => void removePhoto(slot, photoId)} onOrigin={(photoId, origin) => updateMeal(slot, (current) => ({ ...current, photos: current.photos.map((photo) => photo.id === photoId ? { ...photo, origin } : photo), status: "draft", error: null }))} onAnalyze={() => void analyzeMeal(slot)} onEdit={() => updateMeal(slot, (current) => ({ ...current, status: "draft", error: null }))} onConfirm={() => { if (meal) handleConfirm(slot, meal); }} onRating={(key, value) => setRating(slot, key, value)} onRetry={() => void analyzeMeal(slot)} onNote={(note) => setNote(slot, note)} /></div>;
    })}</div>
  </section>;
}

export default MealJournal;
