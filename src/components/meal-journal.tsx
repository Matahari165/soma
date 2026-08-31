"use client";

import {
  AlertCircle,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { MAX_MEAL_PHOTOS } from "@/domain/meals";
import { normalizeMealImage } from "@/services/meal-image";
import styles from "./meal-journal.module.css";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];
export type MealOrigin = "homemade" | "prepared" | "mixed";
export type MealStatus = "draft" | "analyzing" | "review" | "confirmed" | "error";
export type Rating = 0 | 1 | 2 | 3 | 4 | 5;

export type MealPhoto = {
  id: string;
  url: string;
  filename?: string;
  origin: MealOrigin | null;
};

export type MealIngredient = {
  id: string;
  name: string;
  portion: string;
  confidence?: "low" | "medium" | "high";
};

export type NutritionRange = {
  low: number | null;
  likely?: number | null;
  high: number | null;
};

export type MealAnalysis = {
  ingredients: MealIngredient[];
  calories: NutritionRange;
  proteinGrams: NutritionRange;
  carbohydratesGrams?: NutritionRange;
  fatGrams?: NutritionRange;
  fiberGrams?: NutritionRange;
  confidence?: "low" | "medium" | "high";
  note?: string;
};

export type MealRecord = {
  id: string;
  date: string;
  slot: MealSlot;
  photos: MealPhoto[];
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
type SaveState = "idle" | "saving" | "error";

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Petit déjeuner",
  lunch: "Déjeuner",
  dinner: "Dîner",
};

const SLOT_SHORT_LABELS: Record<MealSlot, string> = {
  breakfast: "Matin",
  lunch: "Midi",
  dinner: "Soir",
};

const ORIGIN_LABELS: Record<MealOrigin, string> = {
  homemade: "Maison",
  prepared: "Préparé / acheté",
  mixed: "Mixte",
};

const RATING_LABELS = {
  mouthHeat: "Bouche chaude",
  stomachLoad: "Repas qui m’a cassé",
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
  return { date, meals: { breakfast: null, lunch: null, dinner: null } };
}

function emptyMeal(date: string, slot: MealSlot): MealRecord {
  return { id: randomId("meal"), date, slot, photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft", error: null, confirmedAt: null };
}

function normalizeMeal(raw: MealRecord, date: string, slot: MealSlot): MealRecord {
  return {
    ...emptyMeal(date, slot),
    ...raw,
    date: raw.date || date,
    slot: raw.slot || slot,
    photos: Array.isArray(raw.photos) ? raw.photos.map((photo) => ({ ...photo, origin: photo.origin ?? null })) : [],
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

async function defaultAnalyze({ date, slot, meal, files }: AnalyzeMealInput) {
  let mealId = meal.id;
  if (mealId.startsWith("meal-")) {
    const createResponse = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": meal.id },
      body: JSON.stringify({ mealDate: date, mealType: slot, status: "draft" }),
    });
    const created = await readJson(createResponse) as { meal: { id: string } };
    mealId = created.meal.id;
  }
  const newPhotos = meal.photos.filter((photo) => files.some((file) => file === filesByFilename(files, photo.filename)));
  if (files.length > 0) {
  const form = new FormData();
    form.set("origins", JSON.stringify(newPhotos.map((photo) => photo.origin)));
  files.forEach((file) => form.append("photos", file, file.name));
    await readJson(await fetch(`/api/meals/${encodeURIComponent(mealId)}/photos`, { method: "POST", body: form }));
  }
  const response = await fetch(`/api/meals/${encodeURIComponent(mealId)}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) });
  const body = await readJson(response);
  return apiMealToRecord(body.meal);
}

async function defaultSave(meal: MealRecord) {
  const response = await fetch(`/api/meals/${encodeURIComponent(meal.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    status: "confirmed",
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
  const result = analysisRecord && isRecord(analysisRecord.result) ? analysisRecord.result : null;
  const rawPhotos = Array.isArray(meal.photos) ? meal.photos : [];
  const rawFoods = result && Array.isArray(result.foods) ? result.foods : [];
  const totals = result && isRecord(result.totals) ? result.totals : {};
  const ingredients = rawFoods.flatMap((rawFood, index) => {
    if (!isRecord(rawFood)) return [];
    const name = typeof rawFood.name === "string" ? rawFood.name : "";
    if (!name) return [];
    return [{ id: `${analysisRecord?.id ?? "analysis"}-${index}`, name, portion: typeof rawFood.portion === "string" ? rawFood.portion : "", confidence: confidence(rawFood.confidence) }];
  });
  const uncertainties = result && Array.isArray(result.uncertainties) ? result.uncertainties.filter((item): item is string => typeof item === "string") : [];
  const mealType = meal.mealType === "breakfast" || meal.mealType === "lunch" || meal.mealType === "dinner" ? meal.mealType : "lunch";
  const rawStatus = meal.status;
  const analysisStatus = analysisRecord?.status;
  return {
    id: typeof meal.id === "string" ? meal.id : randomId("meal"),
    date: typeof meal.mealDate === "string" ? meal.mealDate : todayInLocalTime(),
    slot: mealType,
    photos: rawPhotos.flatMap((rawPhoto) => {
      if (!isRecord(rawPhoto) || typeof rawPhoto.id !== "string") return [];
      return [{ id: rawPhoto.id, url: typeof rawPhoto.url === "string" ? rawPhoto.url : "", filename: typeof rawPhoto.filename === "string" ? rawPhoto.filename : undefined, origin: isMealOrigin(rawPhoto.origin) ? rawPhoto.origin : null }];
    }),
    analysis: result ? {
      ingredients,
      calories: apiRange(totals.calories),
      proteinGrams: apiRange(totals.proteinGrams),
      carbohydratesGrams: apiRange(totals.carbohydrateGrams),
      fatGrams: apiRange(totals.fatGrams),
      fiberGrams: apiRange(totals.fiberGrams),
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
    foods: analysis.ingredients.filter((ingredient) => ingredient.name.trim()).map((ingredient) => ({ name: ingredient.name.trim(), preparation: null, portion: ingredient.portion.trim() || null, estimatedGrams: null, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: ingredient.confidence ?? "medium" })),
    totals: { calories, proteinGrams, carbohydrateGrams: normalizedApiRange(analysis.carbohydratesGrams), fatGrams: normalizedApiRange(analysis.fatGrams), fiberGrams: normalizedApiRange(analysis.fiberGrams) },
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

function statusLabel(meal: MealRecord | null) {
  if (!meal) return "À commencer";
  if (meal.status === "analyzing") return "Analyse…";
  if (meal.status === "review") return "À relire";
  if (meal.status === "confirmed") return "Confirmé";
  if (meal.status === "error") return "À réessayer";
  if (meal.photos.length > 0) return "Photos ajoutées";
  return "À commencer";
}

function PhotoOriginPicker({ photo, onChange }: { photo: MealPhoto; onChange: (origin: MealOrigin) => void }) {
  return <fieldset className={styles.originFieldset}>
    <legend>Origine de la photo</legend>
    <div className={styles.originChoices} role="group" aria-label={`Origine de ${photo.filename ?? "la photo"}`}>
      {(Object.keys(ORIGIN_LABELS) as MealOrigin[]).map((origin) => <button className={photo.origin === origin ? styles.originChoiceSelected : styles.originChoice} type="button" key={origin} aria-pressed={photo.origin === origin} onClick={() => onChange(origin)}>{ORIGIN_LABELS[origin]}</button>)}
    </div>
  </fieldset>;
}

function RatingScale({ label, value, onChange }: { label: string; value: Rating | null; onChange: (next: Rating) => void }) {
  return <fieldset className={styles.ratingFieldset}>
    <legend>{label}</legend>
    <div className={styles.ratingScale} role="group" aria-label={`${label}, de aucune à 5`}>
      <button className={value === 0 ? styles.ratingSelected : styles.ratingChoice} type="button" aria-pressed={value === 0} onClick={() => onChange(0)}>Aucune</button>
      {[1, 2, 3, 4, 5].map((rating) => <button className={value === rating ? styles.ratingSelected : styles.ratingChoice} type="button" aria-pressed={value === rating} onClick={() => onChange(rating as Rating)} key={rating}>{rating}</button>)}
    </div>
  </fieldset>;
}

function PhotoInput({ slot, onFiles, disabled = false }: { slot: MealSlot; onFiles: (files: File[]) => void | Promise<void>; disabled?: boolean }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const readFiles = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")));
    event.target.value = "";
  };
  return <div className={styles.photoInput}>
    <input ref={cameraRef} className={styles.visuallyHidden} type="file" accept="image/*" capture="environment" aria-label={`Prendre une photo pour le ${SLOT_LABELS[slot]}`} onChange={readFiles} />
    <input ref={galleryRef} className={styles.visuallyHidden} type="file" accept="image/*" multiple aria-label={`Choisir des photos pour le ${SLOT_LABELS[slot]}`} onChange={readFiles} />
    <button className={styles.captureButton} type="button" disabled={disabled} onClick={() => cameraRef.current?.click()}><Camera size={17} aria-hidden="true" />Prendre une photo</button>
    <button className={styles.galleryButton} type="button" disabled={disabled} onClick={() => galleryRef.current?.click()}><ImagePlus size={17} aria-hidden="true" />Choisir dans Photos</button>
  </div>;
}

function PhotoStrip({ meal, files, onRemove, onOrigin, disabled }: { meal: MealRecord; files: Record<string, File>; onRemove: (photoId: string) => void; onOrigin: (photoId: string, origin: MealOrigin) => void; disabled: boolean }) {
  return <div className={styles.photoGrid} role="list" aria-label={`${meal.photos.length} photo${meal.photos.length > 1 ? "s" : ""} du repas`}>
    {meal.photos.map((photo, index) => <figure className={styles.photo} role="listitem" key={photo.id}>
      <div className={styles.photoFrame}>
        {/* User-selected blob URLs and authenticated photo routes cannot use next/image's static loader. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.filename ? `Photo ${index + 1}, ${photo.filename}` : `Photo ${index + 1} du repas`} width={360} height={280} />
        <button className={styles.photoRemove} type="button" disabled={disabled} onClick={() => onRemove(photo.id)} aria-label={`Retirer la photo ${index + 1}`}><X size={15} aria-hidden="true" /></button>
      </div>
      <figcaption><span>Photo {index + 1}{files[photo.id] ? " · nouvelle" : ""}</span><PhotoOriginPicker photo={photo} onChange={(origin) => onOrigin(photo.id, origin)} /></figcaption>
    </figure>)}
  </div>;
}

function ReviewForm({ meal, onChange, onAddIngredient }: { meal: MealRecord; onChange: (next: MealRecord) => void; onAddIngredient: () => void }) {
  const analysis = meal.analysis;
  if (!analysis) return <div className={styles.analysisMissing} role="status">L’analyse n’a pas renvoyé de composition à relire.</div>;
  const updateRange = (key: "calories" | "proteinGrams", edge: "low" | "high", raw: string) => onChange({ ...meal, analysis: { ...analysis, [key]: { ...analysis[key], [edge]: raw === "" ? null : Number(raw) } } });
  return <div className={styles.reviewBody}>
    <div className={styles.reviewIntro}><div><span className={styles.eyebrow}>Relecture</span><p>Corrige les éléments importants avant de confirmer. Les valeurs restent des estimations.</p></div><span className={styles.aiBadge}><Sparkles size={14} aria-hidden="true" />Grok</span></div>
    <div className={styles.ingredientList}>
      <div className={styles.reviewHeading}><h4>Composition</h4><span>{analysis.ingredients.length} élément{analysis.ingredients.length > 1 ? "s" : ""}</span></div>
      {analysis.ingredients.map((ingredient) => <div className={styles.ingredientRow} key={ingredient.id}>
        <label><span className={styles.visuallyHidden}>Aliment</span><input value={ingredient.name} aria-label={`Aliment ${ingredient.name}`} onChange={(event) => onChange({ ...meal, analysis: { ...analysis, ingredients: analysis.ingredients.map((item) => item.id === ingredient.id ? { ...item, name: event.target.value } : item) } })} /></label>
        <label><span className={styles.visuallyHidden}>Portion</span><input value={ingredient.portion} aria-label={`Portion de ${ingredient.name}`} onChange={(event) => onChange({ ...meal, analysis: { ...analysis, ingredients: analysis.ingredients.map((item) => item.id === ingredient.id ? { ...item, portion: event.target.value } : item) } })} /></label>
      </div>)}
      <button className={styles.addIngredient} type="button" onClick={onAddIngredient}><Plus size={15} aria-hidden="true" />Ajouter un aliment</button>
    </div>
    <div className={styles.nutritionReview}>
      <div className={styles.reviewHeading}><h4>Estimation</h4><span>{analysis.confidence ? `Confiance ${analysis.confidence === "high" ? "haute" : analysis.confidence === "medium" ? "moyenne" : "faible"}` : "Fourchette"}</span></div>
      <label className={styles.rangeField}><span>Calories</span><span className={styles.rangeInputs}><input type="number" min="0" inputMode="numeric" aria-label="Calories minimum" value={analysis.calories.low ?? ""} onChange={(event) => updateRange("calories", "low", event.target.value)} /><span aria-hidden="true">–</span><input type="number" min="0" inputMode="numeric" aria-label="Calories maximum" value={analysis.calories.high ?? ""} onChange={(event) => updateRange("calories", "high", event.target.value)} /><small>kcal</small></span></label>
      <label className={styles.rangeField}><span>Protéines</span><span className={styles.rangeInputs}><input type="number" min="0" inputMode="decimal" aria-label="Protéines minimum" value={analysis.proteinGrams.low ?? ""} onChange={(event) => updateRange("proteinGrams", "low", event.target.value)} /><span aria-hidden="true">–</span><input type="number" min="0" inputMode="decimal" aria-label="Protéines maximum" value={analysis.proteinGrams.high ?? ""} onChange={(event) => updateRange("proteinGrams", "high", event.target.value)} /><small>g</small></span></label>
    </div>
    {analysis.note && <p className={styles.analysisNote}>{analysis.note}</p>}
  </div>;
}

function MealCard({ meal, slot, files, saveState, processingFiles, mutationBusy, onFiles, onRemovePhoto, onOrigin, onAnalyze, onEdit, onReviewChange, onAddIngredient, onConfirm, onRating, onRetry }: {
  meal: MealRecord | null;
  slot: MealSlot;
  files: Record<string, File>;
  saveState: SaveState;
  processingFiles: boolean;
  mutationBusy: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
  onRemovePhoto: (photoId: string) => void;
  onOrigin: (photoId: string, origin: MealOrigin) => void;
  onAnalyze: () => void;
  onEdit: () => void;
  onReviewChange: (next: MealRecord) => void;
  onAddIngredient: () => void;
  onConfirm: () => void;
  onRating: (key: "mouthHeat" | "stomachLoad", value: Rating | null) => void;
  onRetry: () => void;
}) {
  const headingId = `meal-${slot}-title`;
  const noOrigin = meal?.photos.some((photo) => !photo.origin) ?? false;
  const canAnalyze = Boolean(meal && meal.photos.length > 0 && meal.photos.length <= MAX_MEAL_PHOTOS && !noOrigin);
  return <article className={`${styles.mealCard} ${meal?.status === "confirmed" ? styles.mealCardConfirmed : ""}`} aria-labelledby={headingId}>
    <header className={styles.mealHeader}>
      <div className={styles.mealTitle}><span className={styles.mealIndex}>{MEAL_SLOTS.indexOf(slot) + 1}</span><div><span className={styles.eyebrow}>{SLOT_SHORT_LABELS[slot]}</span><h3 id={headingId}>{SLOT_LABELS[slot]}</h3></div></div>
      <span className={styles.mealStatus} data-status={meal?.status ?? "empty"}>{meal?.status === "confirmed" ? <Check size={14} aria-hidden="true" /> : null}{statusLabel(meal)}</span>
    </header>
    {!meal || meal.photos.length === 0 ? <div className={styles.emptyMeal}>
      <div><Utensils size={18} aria-hidden="true" /><p>Une photo suffit pour garder la trace de ce repas.</p></div>
      <PhotoInput slot={slot} onFiles={onFiles} disabled={processingFiles} />
    </div> : <>
      {meal.status === "analyzing" && <div className={styles.analyzingState} role="status" aria-live="polite"><LoaderCircle className={styles.spin} size={22} aria-hidden="true" /><div><strong>Analyse des photos en cours</strong><span>Grok prépare une estimation à relire.</span></div></div>}
      {meal.status !== "analyzing" && <div className={styles.mealBody}>
        <PhotoStrip meal={meal} files={files} onRemove={onRemovePhoto} onOrigin={onOrigin} disabled={mutationBusy} />
        {meal.status === "draft" && <div className={styles.photoActions}><PhotoInput slot={slot} onFiles={onFiles} disabled={processingFiles} /><button className={styles.analyzeButton} type="button" disabled={!canAnalyze || processingFiles} onClick={onAnalyze}><Sparkles size={17} aria-hidden="true" />{processingFiles ? "Préparation…" : "Analyser les photos"}<ChevronRight size={16} aria-hidden="true" /></button>{noOrigin && <p className={styles.inlineHint}>Choisis l’origine de chaque photo pour continuer.</p>}</div>}
        {meal.status === "error" && <div className={styles.errorState} role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Analyse interrompue</strong><span>{meal.error || "Réessaie lorsque la connexion sera disponible."}</span></div><button className={styles.retryButton} type="button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Réessayer</button></div>}
        {meal.status === "review" && <><ReviewForm meal={meal} onChange={onReviewChange} onAddIngredient={onAddIngredient} /><div className={styles.reviewActions}><button className={styles.secondaryButton} type="button" disabled={mutationBusy} onClick={onEdit}>Modifier les photos</button><button className={styles.confirmButton} type="button" disabled={mutationBusy} onClick={onConfirm}>{saveState === "saving" ? <LoaderCircle className={styles.spin} size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}Confirmer le repas</button></div></>}
        {meal.status === "confirmed" && <div className={styles.confirmedSummary}><div className={styles.confirmedNutrition}><span><strong>{formatRange(meal.analysis?.calories, "kcal")}</strong>Calories</span><span><strong>{formatRange(meal.analysis?.proteinGrams, "g")}</strong>Protéines</span></div><p>{meal.analysis?.ingredients.map((ingredient) => ingredient.name).join(" · ") || "Composition non détaillée"}</p><button className={styles.editButton} type="button" onClick={onEdit}>Relire ou modifier <ChevronRight size={15} aria-hidden="true" /></button></div>}
        {(meal.status === "review" || meal.status === "confirmed") && <div className={styles.ratings}><RatingScale label={RATING_LABELS.mouthHeat} value={meal.mouthHeat} onChange={(value) => onRating("mouthHeat", value)} /><RatingScale label={RATING_LABELS.stomachLoad} value={meal.stomachLoad} onChange={(value) => onRating("stomachLoad", value)} /></div>}
      </div>}
    </>}
  </article>;
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
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [processingFiles, setProcessingFiles] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const objectUrls = useRef(new Set<string>());
  const loadRequestId = useRef(0);
  const mutationInFlight = useRef(false);
  const navigationDisabled = processingFiles || deletingPhotoId !== null || saveState === "saving" || Object.values(data?.meals ?? {}).some((meal) => meal?.status === "analyzing");

  const selectDate = useCallback((nextDate: string) => {
    if (navigationDisabled || mutationInFlight.current) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate > today) return;
    if (nextDate === selectedDate) return;
    loadRequestId.current += 1;
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    setFilesByPhotoId({});
    setFileError(null);
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
      const remaining = Math.max(0, MAX_MEAL_PHOTOS - meal.photos.length);
      const accepted = prepared.slice(0, remaining);
      const newPhotos = accepted.map((file) => {
        const id = randomId("photo");
        const url = URL.createObjectURL(file);
        objectUrls.current.add(url);
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
      return { ...current, meals: { ...current.meals, [slot]: photos.length ? { ...meal, photos, status: "draft", error: null } : null } };
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

  const saveMeal = async (meal: MealRecord, status: MealStatus = "confirmed") => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setSaveState("saving");
    try {
      const saved = await (api?.save ? api.save({ ...meal, status }) : defaultSave({ ...meal, status }));
      const nextMeal = normalizeMeal({ ...meal, ...saved, status }, selectedDate, meal.slot);
      setData((current) => current ? { ...current, meals: { ...current.meals, [meal.slot]: nextMeal } } : current);
      setSaveState("idle");
    } catch (error) {
      setSaveState("error");
      updateMeal(meal.slot, (current) => ({ ...current, status: "review", error: error instanceof Error ? error.message : "Le repas n’a pas pu être enregistré." }));
    } finally {
      mutationInFlight.current = false;
    }
  };

  const analyzeMeal = async (slot: MealSlot) => {
    const meal = data?.meals[slot];
    if (!meal || meal.photos.length === 0 || mutationInFlight.current) return;
    mutationInFlight.current = true;
    updateMeal(slot, (current) => ({ ...current, status: "analyzing", error: null }));
    try {
      const files = meal.photos.map((photo) => filesByPhotoId[photo.id]).filter((file): file is File => Boolean(file));
      const analyzed = await (api?.analyze ? api.analyze({ date: selectedDate, slot, meal, files }) : defaultAnalyze({ date: selectedDate, slot, meal, files }));
      updateMeal(slot, (current) => ({ ...current, ...normalizeMeal({ ...analyzed, photos: analyzed.photos?.length ? analyzed.photos : current.photos, status: "review", error: null }, selectedDate, slot), status: "review" }));
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
    if (meal.status === "confirmed") void saveMeal(next);
  };

  const historyDates = mealHistoryDates(selectedDate, today);
  const dateNavigation = <nav className={styles.historyNavigation} aria-label="Historique des repas">
    <div className={styles.historyControls}>
      <button type="button" className={styles.historyArrow} disabled={navigationDisabled} onClick={() => selectDate(shiftIsoDate(selectedDate, -1))} aria-label="Jour précédent"><ChevronLeft size={18} aria-hidden="true" /></button>
      <label className={styles.datePicker}><span>Date</span><input type="date" max={today} value={selectedDate} disabled={navigationDisabled} onChange={(event) => selectDate(event.target.value)} /></label>
      <button type="button" className={styles.historyArrow} disabled={navigationDisabled || selectedDate >= today} onClick={() => selectDate(shiftIsoDate(selectedDate, 1))} aria-label="Jour suivant"><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
    <div className={styles.weekStrip} role="group" aria-label="Sept jours">
      {historyDates.map((historyDate) => {
        const label = compactDayLabel(historyDate);
        return <button key={historyDate} type="button" disabled={navigationDisabled} className={historyDate === selectedDate ? styles.weekDaySelected : styles.weekDay} aria-pressed={historyDate === selectedDate} aria-label={formatDate(historyDate)} onClick={() => selectDate(historyDate)}><span>{label.weekday}</span><strong>{label.day}</strong></button>;
      })}
    </div>
  </nav>;

  if (loadState === "loading") return <section className={`${styles.root} ${className ?? ""}`} aria-labelledby="meal-journal-title"><header className={styles.pageHeader}><div><span className={styles.eyebrow}>Personal Lab · alimentation</span><h2 id="meal-journal-title">Repas</h2></div><span className={styles.dateLabel}>{formatDate(selectedDate)}</span></header>{dateNavigation}<div className={styles.loadingState} role="status" aria-live="polite"><LoaderCircle className={styles.spin} size={21} aria-hidden="true" /><span>Chargement des repas…</span></div></section>;
  if (loadState === "error") return <section className={`${styles.root} ${className ?? ""}`} aria-labelledby="meal-journal-title"><header className={styles.pageHeader}><div><span className={styles.eyebrow}>Personal Lab · alimentation</span><h2 id="meal-journal-title">Repas</h2></div><span className={styles.dateLabel}>{formatDate(selectedDate)}</span></header>{dateNavigation}<div className={styles.errorState} role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Impossible de charger les repas</strong><span>{loadError}</span></div><button className={styles.retryButton} type="button" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" />Réessayer</button></div></section>;

  const readyData = data ?? emptyData(selectedDate);
  const confirmed = MEAL_SLOTS.filter((slot) => readyData.meals[slot]?.status === "confirmed").length;
  return <section className={`${styles.root} ${className ?? ""}`} aria-labelledby="meal-journal-title">
    <header className={styles.pageHeader}><div><span className={styles.eyebrow}>Personal Lab · alimentation</span><h2 id="meal-journal-title">Repas</h2></div><div className={styles.dateBlock}><span>{formatDate(readyData.date)}</span><small>{confirmed}/3 confirmés</small></div></header>
    {dateNavigation}
    <div className={styles.introRow}><p>Photographie ce que tu manges. Soma garde les photos, estime la composition, puis relie les repas à tes signaux au fil du temps.</p><span className={styles.limitNote}>1–{MAX_MEAL_PHOTOS} photos · 3 moments</span></div>
    {fileError && <div className={styles.fileError} role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{fileError}</span><button className={styles.dismissError} type="button" onClick={() => setFileError(null)} aria-label="Fermer le message photo"><X size={16} aria-hidden="true" /></button></div>}
    <nav className={styles.mealIndex} aria-label="Avancement des repas">{MEAL_SLOTS.map((slot) => <a href={`#meal-${slot}`} className={styles.mealIndexItem} key={slot}><span>{SLOT_SHORT_LABELS[slot]}</span><strong data-status={readyData.meals[slot]?.status ?? "empty"}>{statusLabel(readyData.meals[slot] ?? null)}</strong></a>)}</nav>
    <div className={styles.mealList}>{MEAL_SLOTS.map((slot) => {
      const meal = readyData.meals[slot] ?? null;
      return <div id={`meal-${slot}`} key={slot}><MealCard meal={meal} slot={slot} files={filesByPhotoId} saveState={saveState} processingFiles={processingFiles} mutationBusy={navigationDisabled} onFiles={(files) => addFiles(slot, files)} onRemovePhoto={(photoId) => void removePhoto(slot, photoId)} onOrigin={(photoId, origin) => updateMeal(slot, (current) => ({ ...current, photos: current.photos.map((photo) => photo.id === photoId ? { ...photo, origin } : photo), status: "draft", error: null }))} onAnalyze={() => void analyzeMeal(slot)} onEdit={() => updateMeal(slot, (current) => ({ ...current, status: "draft", error: null }))} onReviewChange={(next) => updateMeal(slot, () => ({ ...next, status: "review", error: null }))} onAddIngredient={() => updateMeal(slot, (current) => current.analysis ? { ...current, analysis: { ...current.analysis, ingredients: [...current.analysis.ingredients, { id: randomId("ingredient"), name: "", portion: "" }] } } : current)} onConfirm={() => { if (meal) void saveMeal(meal); }} onRating={(key, value) => setRating(slot, key, value)} onRetry={() => void analyzeMeal(slot)} /></div>;
    })}</div>
  </section>;
}

export default MealJournal;
