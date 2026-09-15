"use client";

import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";
import { MAX_MEAL_PHOTOS, type MealEntryState, type MealFoodCourse } from "@/domain/meals";
import {
  apiMealToRecord,
  MEAL_TOTALS_EVENT,
  MEAL_TOTALS_REQUEST_EVENT,
  MEAL_SLOTS,
  randomId,
  todayInLocalTime,
  type AnalyzeMealInput,
  type MealAnalysis,
  type MealIngredient,
  type MealJournalApi,
  type MealJournalData,
  type MealCorrection,
  type MealOrigin,
  type MealPhoto,
  type MealRecord,
  type MealSlot,
  type MealStatus,
  type NutritionRange,
  type Rating,
} from "@/domain/meal-record";
import {
  DEFAULT_NUTRITION_TARGETS,
  mergeDailyNutritionTargets,
  nutritionTargetsForEffort,
  loadNutritionTargets,
  parseNutritionTargets,
  saveNutritionTargets,
  type EffortTargetContext,
  type NutritionTargets,
} from "@/domain/nutrition-targets";
import { fetchMeal, fetchMealWithTimeout } from "@/services/meal-client";
import { normalizeMealImage } from "@/services/meal-image";
import { LabMealCard, type MealDesignVariant } from "@/components/lab/meal-card-variants";
import styles from "./meal-journal.module.css";

export { apiMealToRecord, MEAL_SLOTS };
export type { MealEntryState } from "@/domain/meals";
export type {
  AnalyzeMealInput,
  MealAnalysis,
  MealIngredient,
  MealJournalApi,
  MealJournalData,
  MealCorrection,
  MealOrigin,
  MealPhoto,
  MealRecord,
  MealSlot,
  MealStatus,
  NutritionRange,
  Rating,
};

const COURSE_LABELS: Record<MealFoodCourse, string> = {
  starter: "Entrée",
  main: "Plat",
  side: "Accompagnement",
  dessert: "Dessert",
};

export const MEAL_DATE_EVENT = "soma:meal-date";
export const RECIPE_TO_DAY_NOTE_EVENT = "soma:recipe-to-day-note";
const DRAFT_NOTE_STORAGE_PREFIX = "soma.meal-note.";

function draftNoteStorageKey(date: string, slot: MealSlot) {
  return `${DRAFT_NOTE_STORAGE_PREFIX}${date}.${slot}`;
}

function readStoredDraftNote(date: string, slot: MealSlot) {
  try {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(draftNoteStorageKey(date, slot)) ?? "";
  } catch {
    return "";
  }
}

function formatIngredientLabel(ingredient: MealIngredient) {
  // Keep the quantity in one place. The model can return both a human portion
  // (for example "300 g") and estimatedGrams; displaying both duplicates the
  // same information in the journal.
  const quantity = ingredient.portion.trim() || (typeof ingredient.estimatedGrams === "number" ? `${Math.round(ingredient.estimatedGrams)} g` : "");
  const preparation = ingredient.preparation?.trim() ? ` · ${ingredient.preparation.trim()}` : "";
  return `${ingredient.name.trim()}${quantity ? ` (${quantity})` : ""}${preparation}`;
}

type Props = {
  date?: string;
  today?: string;
  initialData?: MealJournalData;
  api?: MealJournalApi;
  className?: string;
  disabledSlots?: readonly MealSlot[];
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  showDateNavigation?: boolean;
  sharedDateNavigation?: ReactNode;
  children?: ReactNode;
  historyDays?: number;
  variant?: "page" | "home" | "lab" | "meals";
  publishMealTotals?: boolean;
  initialTargets?: NutritionTargets;
  initialEffectiveTargets?: NutritionTargets;
  initialEffortTargetContext?: EffortTargetContext;
  hideAddMealButton?: boolean;
  allowTargetEditing?: boolean;
  designVariant?: MealDesignVariant;
};

type LoadState = "loading" | "ready" | "error";

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Petit déjeuner",
  lunch: "Déjeuner",
  dinner: "Dîner",
  snack: "Collation",
};

const SLOT_ARTICLES: Record<MealSlot, "le" | "la"> = {
  breakfast: "le",
  lunch: "le",
  dinner: "le",
  snack: "la",
};

function mealLabelWithArticle(slot: MealSlot) {
  return `${SLOT_ARTICLES[slot]} ${SLOT_LABELS[slot].toLowerCase()}`;
}

const ORIGIN_LABELS: Record<MealOrigin, string> = {
  homemade: "Maison",
  prepared: "Préparé / acheté",
  mixed: "Mixte",
};

const RATING_LABELS = {
  mouthHeat: "Bouche chaude",
  stomachLoad: "Repas qui m'a cassé",
} as const;

function shiftIsoDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mealHistoryDates(selectedDate: string, today = todayInLocalTime(), count = 7) {
  const start = selectedDate < shiftIsoDate(today, -3) ? shiftIsoDate(selectedDate, 3) : today;
  return Array.from({ length: Math.max(1, Math.floor(count)) }, (_, index) => shiftIsoDate(start, -index));
}

export function calorieProgressForDisplay(calories: number | null, target: number) {
  if (calories === null) return null;
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.round((calories / target) * 100));
}

export type MealIngredientTree = {
  ingredient: MealIngredient;
  children: MealIngredientTree[];
};

export function groupMealIngredients(ingredients: readonly MealIngredient[]): MealIngredientTree[] {
  const nodes = ingredients.map((ingredient) => ({ ingredient, children: [] as MealIngredientTree[] }));
  const byId = new Map(nodes.map((node) => [node.ingredient.id, node]));
  const roots: MealIngredientTree[] = [];

  for (const node of nodes) {
    const parentId = node.ingredient.parentId?.trim();
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function ingredientCourse(node: MealIngredientTree, inferUnparentedCourse: boolean): MealFoodCourse | null {
  if (node.ingredient.course) return node.ingredient.course;
  if (node.ingredient.kind === "dish") return "main";
  if (!inferUnparentedCourse) return null;
  return node.ingredient.foodGroups?.some((group) => group === "fruit" || group === "sweet") ? "dessert" : "side";
}

function groupIngredientSections(nodes: readonly MealIngredientTree[]) {
  const sections: Array<{ key: string; course: MealFoodCourse | null; nodes: MealIngredientTree[] }> = [];
  const hasDishRoot = nodes.some((node) => node.ingredient.kind === "dish");
  for (const node of nodes) {
    const course = ingredientCourse(node, hasDishRoot && !node.ingredient.parentId);
    const section = course ? sections.find((candidate) => candidate.course === course) : undefined;
    if (section) section.nodes.push(node);
    else sections.push({ key: `${course ?? "unclassified"}-${node.ingredient.id}`, course, nodes: [node] });
  }
  return sections;
}

function hasNutritionValue(range: NutritionRange | undefined) {
  return Boolean(range && (range.low !== null || range.likely !== null && range.likely !== undefined || range.high !== null));
}

function ingredientNutritionLabel(ingredient: MealIngredient) {
  const parts = [
    hasNutritionValue(ingredient.calories) ? `${likelyLabel(ingredient.calories)} kcal` : null,
    hasNutritionValue(ingredient.proteinGrams) ? `${likelyLabel(ingredient.proteinGrams)} g prot.` : null,
    hasNutritionValue(ingredient.carbohydratesGrams) ? `${likelyLabel(ingredient.carbohydratesGrams)} g gluc.` : null,
    hasNutritionValue(ingredient.fatGrams) ? `${likelyLabel(ingredient.fatGrams)} g lip.` : null,
    hasNutritionValue(ingredient.fiberGrams) ? `${likelyLabel(ingredient.fiberGrams)} g fibres` : null,
    hasNutritionValue(ingredient.sugarGrams) ? `${likelyLabel(ingredient.sugarGrams)} g sucres` : null,
    hasNutritionValue(ingredient.addedSugarGrams) ? `${likelyLabel(ingredient.addedSugarGrams)} g sucres ajoutés` : null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function normalizedDisplayText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").trim();
}

function IngredientTreeItem({ node }: { node: MealIngredientTree }) {
  const nutrition = ingredientNutritionLabel(node.ingredient);
  return <li className={styles.ingredientItem} data-kind={node.ingredient.kind ?? "unknown"} data-parent-id={node.ingredient.parentId ?? undefined}>
    <strong>{formatIngredientLabel(node.ingredient)}</strong>
    {nutrition && <small>{nutrition}</small>}
    {node.children.length > 0 && <ul className={styles.ingredientChildren}>{node.children.map((child) => <IngredientTreeItem key={child.ingredient.id} node={child} />)}</ul>}
  </li>;
}

function IngredientGroups({ analysis }: { analysis: MealAnalysis }) {
  const roots = groupMealIngredients(analysis.ingredients);
  if (roots.length === 0) return <p className={styles.ingredientsList}>Composition non détaillée</p>;
  const sections = groupIngredientSections(roots);
  const dishType = analysis.dishType?.trim();
  const hasDishRoot = Boolean(dishType && roots.some((node) => node.ingredient.kind === "dish" && (normalizedDisplayText(dishType).includes(normalizedDisplayText(node.ingredient.name)) || normalizedDisplayText(node.ingredient.name).includes(normalizedDisplayText(dishType)))));
  return <div className={styles.ingredientGroups} aria-label="Composition du repas">
    {dishType && !hasDishRoot && <p className={styles.dishType}><strong>{dishType}</strong></p>}
    <ul className={styles.ingredientSections}>
      {sections.map((section) => <li className={styles.ingredientSection} data-course={section.course ?? "unclassified"} key={section.key}>
        {section.course && <p className={styles.ingredientSectionLabel}>{COURSE_LABELS[section.course]}</p>}
        <ul className={styles.ingredientList}>{section.nodes.map((node) => <IngredientTreeItem key={node.ingredient.id} node={node} />)}</ul>
      </li>)}
    </ul>
  </div>;
}

function compactDayLabel(date: string, today?: string) {
  const value = new Date(`${date}T12:00:00`);
  const relativeDays = today
    ? Math.round((new Date(`${today}T12:00:00`).getTime() - value.getTime()) / 86_400_000)
    : null;
  const weekday = relativeDays === 0
    ? "Aujourd’hui"
    : relativeDays === 1
      ? "Hier"
      : relativeDays === 2
        ? "Avant-hier"
        : new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(value).replace(".", "");
  return {
    weekday,
    day: new Intl.DateTimeFormat("fr-FR", today ? { day: "numeric", month: "short" } : { day: "numeric" }).format(value).replace(".", ""),
  };
}

function emptyData(date: string): MealJournalData {
  return { date, meals: { breakfast: null, lunch: null, snack: null, dinner: null } };
}

function emptyMeal(date: string, slot: MealSlot): MealRecord {
  return { id: randomId("meal"), date, slot, photos: [], note: "", analysis: null, mouthHeat: null, stomachLoad: null, status: "draft", entryState: "recorded", error: null, confirmedAt: null };
}

export function firstAvailableMealSlot(meals: MealJournalData["meals"], disabledSlots: readonly MealSlot[] = []) {
  return MEAL_SLOTS.find((slot) => !disabledSlots.includes(slot) && !meals[slot]) ?? null;
}

/**
 * Returns the recovery copy for an over-limit selection without changing the
 * accepted photos. Keeping this pure makes the boundary easy to test and
 * keeps the client message in French even when the API is not reached.
 */
export function mealPhotoLimitMessage(activePhotoCount: number, incomingPhotoCount: number, maxPhotos = MAX_MEAL_PHOTOS) {
  const available = Math.max(0, maxPhotos - Math.max(0, activePhotoCount));
  const rejected = Math.max(0, incomingPhotoCount - available);
  if (rejected === 0) return null;
  if (available === 0) return `Maximum de ${maxPhotos} photos par repas atteint. Retire une photo avant d’en ajouter une autre.`;
  const subject = `${rejected} photo${rejected > 1 ? "s" : ""}`;
  return `${maxPhotos} photos maximum par repas. ${subject} ${rejected > 1 ? "n’ont pas été ajoutées" : "n’a pas été ajoutée"}.`;
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
    entryState: raw.entryState ?? "recorded",
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
  if (!response.ok) {
    const error = new Error(typeof body?.error === "string" ? body.error : "Les repas ne sont pas disponibles pour le moment.");
    Object.assign(error, { code: typeof body?.code === "string" ? body.code : "UNKNOWN_ANALYSIS_ERROR", requestId: typeof body?.requestId === "string" ? body.requestId : response.headers.get("X-Analysis-Request-Id") });
    throw error;
  }
  return body;
}

async function defaultLoad(date: string) {
  const response = await fetchMealWithTimeout(`/api/meals?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`, { cache: "no-store" }, 15_000, { operation: "load" });
  const body = await readJson(response) as { meals?: unknown[] };
  const meals = Array.isArray(body.meals) ? body.meals.map(apiMealToRecord) : [];
  return { date, meals: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, meals.find((meal) => meal.slot === slot) ?? null])) } as MealJournalData;
}

type UploadedPhotoPair = { localPhotoId: string; photo: MealPhoto };

type DefaultAnalyzeOptions = {
  onPhotosUploaded?: (photos: UploadedPhotoPair[]) => void;
};

export async function defaultAnalyze({ date, slot, meal, files, photoFiles, correction }: AnalyzeMealInput, options: DefaultAnalyzeOptions = {}) {
  const hasPhotoEvidence = files.length > 0 || (meal.status !== "confirmed" && meal.photos.some((photo) => (photo.storageStatus ?? "available") === "available"));
  const hasTextEvidence = Boolean(meal.note.trim());
  if (!hasPhotoEvidence && !hasTextEvidence) throw new Error("Ajoute une photo ou une description du repas avant de lancer l’analyse.");
  const analysisRequestId = randomId("analysis");
  let mealId = meal.id;
  const isNewMeal = mealId.startsWith("meal-");
  if (isNewMeal) {
    const createResponse = await fetchMealWithTimeout("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": meal.id },
      body: JSON.stringify({ mealDate: date, mealType: slot, status: "draft", entryState: "recorded", ...(meal.note.trim() ? { note: meal.note.trim().slice(0, 500) } : {}) }),
    }, 15_000, { operation: "create", requestId: analysisRequestId });
    const created = await readJson(createResponse) as { meal: { id: string } };
    mealId = created.meal.id;
  }
  const uploadEntries = photoFiles?.length
    ? photoFiles
      .map(({ photoId, file }) => ({ photo: meal.photos.find((candidate) => candidate.id === photoId), file }))
      .filter((entry): entry is { photo: MealPhoto; file: File } => Boolean(entry.photo))
    : meal.photos.flatMap((photo) => {
      const file = filesByFilename(files, photo.filename);
      return file ? [{ photo, file }] : [];
    });
  if (!isNewMeal) {
    await readJson(await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(mealId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: meal.note.trim().slice(0, 500), entryState: "recorded" }) }, 15_000, { operation: "update", requestId: analysisRequestId }));
  }
  if (files.length > 0) {
    const uploadFiles = uploadEntries.map((entry) => entry.file);
    const origins = uploadEntries.map((entry) => entry.photo.origin ?? "unknown");
    if (uploadFiles.length !== files.length) throw new Error("Les photos sélectionnées ne correspondent plus au repas.");
    const form = new FormData();
    form.set("origins", JSON.stringify(origins));
    uploadFiles.forEach((file) => form.append("photos", file, file.name));
    const uploadKey = `meal-${mealId}-photos-${uploadEntries.map((entry) => entry.photo.id).join("-")}`;
    const uploadedBody = await readJson(await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(mealId)}/photos`, { method: "POST", headers: { "Idempotency-Key": uploadKey }, body: form }, 60_000, { operation: "upload", requestId: analysisRequestId })) as { photos?: MealPhoto[] };
    if (!Array.isArray(uploadedBody.photos) || uploadedBody.photos.length !== uploadEntries.length) throw new Error("Le serveur n’a pas confirmé toutes les photos du repas.");
    options.onPhotosUploaded?.(uploadEntries.map((entry, index) => ({ localPhotoId: entry.photo.id, photo: uploadedBody.photos?.[index] as MealPhoto })));
  }
  const response = await fetchMeal(`/api/meals/${encodeURIComponent(mealId)}/analyze`, { method: "POST", headers: { "Content-Type": "application/json", "X-Analysis-Request-Id": analysisRequestId, "Idempotency-Key": analysisRequestId }, body: JSON.stringify({ force: Boolean(correction || meal.analysis), idempotencyKey: analysisRequestId, ...(correction ? { correction } : {}) }) }, { operation: "analyze", requestId: analysisRequestId });
  const body = await readJson(response);
  if (!body || typeof body.meal !== "object" || body.meal === null) throw new Error("Le serveur n’a pas retourné le repas analysé.");
  return apiMealToRecord(body.meal);
}

export async function defaultSave(meal: MealRecord) {
  let mealId = meal.id;
  if (mealId.startsWith("meal-")) {
    const createResponse = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": meal.id },
      body: JSON.stringify({ mealDate: meal.date, mealType: meal.slot, status: "draft", entryState: meal.entryState ?? "recorded", ...(meal.note.trim() ? { note: meal.note.trim().slice(0, 500) } : {}) }),
    });
    const created = await readJson(createResponse) as { meal: { id: string } };
    mealId = created.meal.id;
  }
  const response = await fetch(`/api/meals/${encodeURIComponent(mealId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    status: "confirmed",
    entryState: meal.entryState ?? "recorded",
    note: meal.note.trim().slice(0, 500),
    mouthWarmthIntensity: serializeRating(meal.mouthHeat),
    stomachOverfullIntensity: serializeRating(meal.stomachLoad),
    ...(meal.analysis ? { confirmedAnalysis: recordAnalysisToApi(meal.analysis) } : {}),
  }) });
  const body = await readJson(response);
  return body.meal ? apiMealToRecord(body.meal) : meal;
}

/** Persist an explicit slot state without creating nutrition or AI evidence. */
export async function defaultSetEntryState(meal: MealRecord, entryState: MealEntryState) {
  if (meal.id.startsWith("meal-")) {
    const response = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": meal.id },
      body: JSON.stringify({ mealDate: meal.date, mealType: meal.slot, entryState }),
    });
    const body = await readJson(response) as { meal?: unknown };
    if (!body.meal || typeof body.meal !== "object") throw new Error("Le statut du créneau n’a pas pu être enregistré.");
    const saved = apiMealToRecord(body.meal);
    return { ...saved, note: meal.note, photos: meal.photos, analysis: meal.analysis };
  }
  const response = await fetch(`/api/meals/${encodeURIComponent(meal.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryState }),
  });
  const body = await readJson(response) as { meal?: unknown };
  if (!body.meal || typeof body.meal !== "object") throw new Error("Le statut du créneau n’a pas pu être enregistré.");
  return apiMealToRecord(body.meal);
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

function normalizedApiRange(range: NutritionRange | undefined) {
  if (!range || range.low === null || range.high === null) return null;
  const low = Math.min(range.low, range.high);
  const high = Math.max(range.low, range.high);
  const likely = typeof range.likely === "number" && range.likely >= low && range.likely <= high ? range.likely : null;
  return likely === null ? { low, high } : { low, likely, high };
}

export function recordAnalysisToApi(analysis: MealAnalysis) {
  const calories = normalizedApiRange(analysis.calories);
  const proteinGrams = normalizedApiRange(analysis.proteinGrams);
  return {
    summary: "Analyse relue et confirmée.",
    dishType: analysis.dishType?.trim() ? analysis.dishType.trim().slice(0, 80) : null,
    calorieAnalysis: analysis.calorieAnalysis?.trim() ? analysis.calorieAnalysis.trim().slice(0, 500) : null,
    foods: analysis.ingredients.filter((ingredient) => ingredient.name.trim()).map((ingredient) => ({
      id: ingredient.sourceId,
      name: ingredient.name.trim(),
      preparation: ingredient.preparation?.trim() || null,
      portion: ingredient.portion.trim() || null,
      estimatedGrams: ingredient.estimatedGrams ?? null,
      kind: ingredient.kind,
      parentId: ingredient.parentId ?? null,
      course: ingredient.course ?? null,
      countedInTotals: ingredient.countedInTotals,
      foodGroups: ingredient.foodGroups,
      varietyKey: ingredient.varietyKey ?? null,
      evidence: ingredient.evidence,
      evidenceSource: ingredient.evidenceSource,
      evidencePhotoIds: ingredient.evidencePhotoIds,
      quantity: ingredient.quantity ?? null,
      novaGroup: ingredient.novaGroup ?? null,
      sugarExposure: ingredient.sugarExposure ?? null,
      qualityProperties: ingredient.qualityProperties,
      observation: ingredient.observation,
      calories: normalizedApiRange(ingredient.calories),
      proteinGrams: normalizedApiRange(ingredient.proteinGrams),
      carbohydrateGrams: normalizedApiRange(ingredient.carbohydratesGrams),
      fatGrams: normalizedApiRange(ingredient.fatGrams),
      fiberGrams: normalizedApiRange(ingredient.fiberGrams),
      sugarGrams: normalizedApiRange(ingredient.sugarGrams),
      addedSugarGrams: normalizedApiRange(ingredient.addedSugarGrams),
      confidence: ingredient.confidence ?? "medium",
    })),
    totals: { calories, proteinGrams, carbohydrateGrams: normalizedApiRange(analysis.carbohydratesGrams), fatGrams: normalizedApiRange(analysis.fatGrams), fiberGrams: normalizedApiRange(analysis.fiberGrams), sugarGrams: normalizedApiRange(analysis.sugarGrams), addedSugarGrams: normalizedApiRange(analysis.addedSugarGrams) },
    confidence: analysis.confidence ?? "medium",
    uncertainties: analysis.uncertainties?.slice(0, 12).map((item) => item.slice(0, 300)) ?? [],
    uncertaintySignals: analysis.uncertaintySignals,
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

type DayTotal = { calories: number | null; protein: number | null; fat: number | null; carbs: number | null; fiber: number | null; addedSugar: number | null };

function sumLikelyDay(meals: MealJournalData["meals"]): DayTotal | null {
  const confirmed = MEAL_SLOTS.map((slot) => meals[slot]).filter((meal): meal is MealRecord => meal !== null && meal !== undefined && meal.status === "confirmed");
  if (confirmed.length === 0) return null;
  let calories: number | null = 0;
  let protein: number | null = 0;
  let fat: number | null = 0;
  let carbs: number | null = 0;
  let fiber: number | null = 0;
  let addedSugar: number | null = 0;
  for (const meal of confirmed) {
    const analysis = meal.analysis;
    const add = (total: number | null, value: number | null) => total === null || value === null ? null : total + value;
    calories = add(calories, likelyOf(analysis?.calories));
    protein = add(protein, likelyOf(analysis?.proteinGrams));
    fat = add(fat, likelyOf(analysis?.fatGrams));
    carbs = add(carbs, likelyOf(analysis?.carbohydratesGrams));
    fiber = add(fiber, likelyOf(analysis?.fiberGrams));
    addedSugar = add(addedSugar, likelyOf(analysis?.addedSugarGrams));
  }
  return {
    calories: calories === null ? null : Math.round(calories),
    protein: protein === null ? null : Math.round(protein),
    fat: fat === null ? null : Math.round(fat),
    carbs: carbs === null ? null : Math.round(carbs),
    fiber: fiber === null ? null : Math.round(fiber),
    addedSugar: addedSugar === null ? null : Math.round(addedSugar),
  };
}

function statusLabel(meal: MealRecord | null) {
  if (!meal) return "";
  if (meal.entryState === "skipped") return "Pas pris";
  if (meal.status === "confirmed") return "Confirmé";
  if (meal.status === "accepted") return "Analyse acceptée";
  if (meal.status === "analyzing") return "Analyse…";
  if (meal.status === "review") return "À relire";
  if (meal.status === "error") return "À réessayer";
  const hasPhotos = meal.photos.some((photo) => (photo.storageStatus ?? "available") === "available");
  const hasText = Boolean(meal.note.trim());
  if (hasPhotos && hasText) return "À analyser";
  if (hasPhotos) return "Photos à analyser";
  if (hasText) return "Texte à analyser";
  return "Brouillon";
}

function visibleAnalysisError(message: string | null | undefined) {
  return message ?? "L’analyse n’a pas abouti. Vérifie ta connexion puis réessaie.";
}

export const MEAL_NOTE_MAX_LENGTH = 500;

function MealNoteCounter({ id, length, maxLength = MEAL_NOTE_MAX_LENGTH }: { id: string; length: number; maxLength?: number }) {
  const remaining = Math.max(0, maxLength - length);
  return <p id={id} className={styles.noteCounter} aria-live="polite">{length}/{maxLength} · reste {remaining}</p>;
}

function MealTextInput({ slot, meal, disabled, placeholder = "Ex. 2 bananes et un café.", onNote, onAnalyze }: { slot: MealSlot; meal: MealRecord | null; disabled: boolean; placeholder?: string; onNote: (note: string) => void; onAnalyze?: () => void }) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onAnalyze?.();
    }
  };
  const counterId = `meal-${slot}-note-count`;
  return <div className={styles.textInput}>
    <label className={styles.visuallyHidden} htmlFor={`meal-${slot}-note`}>Décrire : {SLOT_LABELS[slot]}</label>
    <textarea id={`meal-${slot}-note`} rows={3} value={meal?.note ?? ""} maxLength={MEAL_NOTE_MAX_LENGTH} placeholder={placeholder} disabled={disabled} onChange={(event) => onNote(event.target.value)} onKeyDown={handleKeyDown} aria-describedby={counterId} />
    <MealNoteCounter id={counterId} length={meal?.note.length ?? 0} />
  </div>;
}

function PhotoOriginPicker({ photo, onChange }: { photo: MealPhoto; onChange: (origin: MealOrigin) => void }) {
  const hintId = `meal-photo-origin-hint-${photo.id}`;
  return <fieldset className={styles.originFieldset} aria-describedby={hintId}>
    <legend>Origine de la photo</legend>
    <p id={hintId} className={styles.originHint}>L’origine aide l’analyse : un plat maison ne se lit pas comme un plat acheté.</p>
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
  const sugarRange = analysis.sugarGrams ?? analysis.addedSugarGrams;
  const sugarLabel = analysis.sugarGrams ? "Sucres" : analysis.addedSugarGrams ? "Sucres ajoutés" : null;
  const nutritionMetrics = [
    { label: "Calories", unit: "kcal", range: analysis.calories, metric: "calories" },
    { label: "Protéines", unit: "g", range: analysis.proteinGrams, metric: "protein" },
    { label: "Lipides", unit: "g", range: analysis.fatGrams, metric: "fat" },
    { label: "Glucides", unit: "g", range: analysis.carbohydratesGrams, metric: "carbs" },
    { label: "Fibres", unit: "g", range: analysis.fiberGrams, metric: "fiber" },
    ...(sugarRange && sugarLabel ? [{ label: sugarLabel, unit: "g", range: sugarRange, metric: "sugar" }] : []),
  ];
  return <div className={styles.analysisDisplay}>
    <div className={styles.confirmedNutrition}>
      {nutritionMetrics.map(({ label, unit, range, metric }) => <span data-metric={metric} key={label} aria-label={`${label} : ${likelyLabel(range)} ${unit}, estimation ${formatLowHigh(range)}`} title={`Estimation ${formatLowHigh(range)} ${unit}`}><small>{label}</small><strong>{likelyLabel(range)} <small>{unit}</small></strong></span>)}
    </div>
    <IngredientGroups analysis={analysis} />
  </div>;
}

function AnalysisSummary({ meal }: { meal: MealRecord }) {
  const analysis = meal.analysis;
  if (!analysis) return null;
  const metrics = [
    { label: "Calories", unit: "kcal", range: analysis.calories, metric: "calories" },
    { label: "Protéines", unit: "g", range: analysis.proteinGrams, metric: "protein" },
    { label: "Sucres ajoutés", unit: "g", range: analysis.addedSugarGrams, metric: "sugar" },
  ];
  return <div className={styles.analysisSummary} aria-label="Résumé nutritionnel">
    {metrics.map(({ label, unit, range, metric }) => <span data-metric={metric} key={label} aria-label={`${label} : ${likelyLabel(range)} ${unit}`}>
      <small>{label}</small>
      <strong>{likelyLabel(range)} <small>{unit}</small></strong>
    </span>)}
  </div>;
}

function LabMealSummary({ meal }: { meal: MealRecord }) {
  const analysis = meal.analysis;
  if (!analysis) return null;
  const roots = groupMealIngredients(analysis.ingredients);
  const mainRoot = roots.find((node) => ingredientCourse(node, false) === "main" || node.ingredient.kind === "dish");
  const main = roots.filter((node) => ingredientCourse(node, false) === "main").map((node) => node.ingredient.name.trim()).filter(Boolean).join(", ") || analysis.dishType?.trim() || mainRoot?.ingredient.name.trim() || roots[0]?.ingredient.name.trim() || meal.note.trim() || "Repas analysé";
  const accompaniments = roots
    .filter((node) => node !== mainRoot && ["side", "dessert"].includes(ingredientCourse(node, false) ?? ""))
    .map((node) => node.ingredient.name.trim())
    .filter(Boolean);
  const nutrition = [
    ["Calories", "kcal", analysis.calories, "calories"],
    ["Protéines", "g", analysis.proteinGrams, "protein"],
    ["Glucides", "g", analysis.carbohydratesGrams, "carbs"],
    ["Lipides", "g", analysis.fatGrams, "fat"],
    ["Sucres ajoutés", "g", analysis.addedSugarGrams, "sugar"],
  ] as const;
  return <div className={styles.labMealSummary} aria-label={`Résumé du ${SLOT_LABELS[meal.slot]}`}>
    <div className={styles.labMealDetails}><p className={styles.labMealDishes}>{main}</p>{accompaniments.length > 0 && <span className={styles.labMealSides}>{accompaniments.join(" · ")}</span>}</div>
    <div className={styles.labMealNutrition} aria-label="Valeurs nutritionnelles estimées">
      {nutrition.map(([label, unit, range, metric]) => <span data-metric={metric} key={label} aria-label={`${label} : ${likelyLabel(range)} ${unit}`}><small>{label}</small><strong>{likelyLabel(range)} <small>{unit}</small></strong></span>)}
    </div>
  </div>;
}

function MealsMealSummary({ meal }: { meal: MealRecord }) {
  const analysis = meal.analysis;
  if (!analysis) return null;

  const roots = groupMealIngredients(analysis.ingredients);
  const mainRoot = roots.find((node) => ingredientCourse(node, false) === "main" || node.ingredient.kind === "dish");
  const main = roots.filter((node) => ingredientCourse(node, false) === "main").map((node) => node.ingredient.name.trim()).filter(Boolean).join(", ") || analysis.dishType?.trim() || mainRoot?.ingredient.name.trim() || roots[0]?.ingredient.name.trim() || meal.note.trim() || "Repas analysé";
  const accompaniments = roots
    .filter((node) => node !== mainRoot && ingredientCourse(node, false) === "side")
    .map((node) => node.ingredient.name.trim())
    .filter(Boolean);
  const fallbackAccompaniments = !mainRoot && accompaniments.length === 0
    ? roots.slice(1).map((node) => node.ingredient.name.trim()).filter(Boolean)
    : accompaniments;
  const macro = [
    ["Prot.", analysis.proteinGrams],
    ["Gluc.", analysis.carbohydratesGrams],
    ["Lip.", analysis.fatGrams],
  ].map(([label, range]) => `${label} ${likelyLabel(range as NutritionRange)} g`).join(" · ");

  return <div className={styles.mealsMealSummary} aria-label={`Composition du ${SLOT_LABELS[meal.slot]}`}>
    <div className={styles.mealsMealDetails}>
      <div><span>Plat principal</span><strong>{main}</strong></div>
      <div><span>Accompagnements</span><strong>{fallbackAccompaniments.length ? fallbackAccompaniments.join(", ") : "—"}</strong></div>
    </div>
    <footer className={styles.mealsMealFooter}><span>{macro}</span></footer>
  </div>;
}

export function MealCorrectionPanel({ meal, onCorrection, onCancel }: { meal: MealRecord; onCorrection: (correction: MealCorrection) => void; onCancel: () => void }) {
  const [correctionText, setCorrectionText] = useState("");
  const submitCorrection = () => {
    const text = correctionText.trim();
    if (!text) return;
    onCorrection(text.slice(0, 500));
  };
  return <div className={styles.analysisDisplay} aria-label="Correction de l’analyse">
    <div className={styles.textInput}>
      <label htmlFor={`meal-correction-${meal.id}`}>Correction en langage naturel</label>
      <textarea id={`meal-correction-${meal.id}`} rows={3} value={correctionText} maxLength={MEAL_NOTE_MAX_LENGTH} placeholder="Ex. Il y avait deux œufs, pas un, et une petite portion de riz." onChange={(event) => setCorrectionText(event.target.value)} aria-describedby={`meal-correction-${meal.id}-count`} />
      <MealNoteCounter id={`meal-correction-${meal.id}-count`} length={correctionText.length} />
      <div className={styles.reviewActions}>
        <button className={styles.analyzeButton} type="button" disabled={!correctionText.trim()} onClick={submitCorrection}>Réanalyser</button>
        <button className={styles.secondaryButton} type="button" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  </div>;
}

function MealCompletionControls({ mutationBusy, onEdit }: {
  status: "review" | "confirmed";
  saving: boolean;
  mutationBusy: boolean;
  onEdit: () => void;
}) {
  return <div className={styles.mealCompletionControls}>
    <div className={styles.reviewActions}>
      <button className={styles.secondaryButton} type="button" disabled={mutationBusy} onClick={onEdit}>Modifier</button>
    </div>
  </div>;
}

type MealAnalysisDisclosureProps = {
  meal: MealRecord;
  status: "review" | "confirmed";
  showExplanation?: boolean;
  correctionMode: boolean;
  ratingSaveState: "idle" | "saving" | "saved" | "error";
  onRating: (key: "mouthHeat" | "stomachLoad", value: Rating | null) => void | Promise<boolean>;
  onCorrection: (correction: MealCorrection) => void;
  onCancel: () => void;
};

function MealAnalysisContent({ meal, showExplanation = false, correctionMode, ratingSaveState, onRating, onCorrection, onCancel }: MealAnalysisDisclosureProps) {
  return <div className={styles.analysisDetailsBody}>
    <AnalysisDisplay meal={meal} />
    {showExplanation && meal.analysis && <div className={styles.analysisExplanation}>
      {meal.analysis.calorieAnalysis && <p>{meal.analysis.calorieAnalysis}</p>}
      {meal.analysis.uncertainties?.map((text) => <p key={text}>{text}</p>)}
    </div>}
    <h4 className={styles.ratingsHeading}>Ressentis</h4>
    <div className={styles.ratings}>
      <RatingScale label={RATING_LABELS.mouthHeat} value={meal.mouthHeat} onChange={(value) => onRating("mouthHeat", value)} />
      <RatingScale label={RATING_LABELS.stomachLoad} value={meal.stomachLoad} onChange={(value) => onRating("stomachLoad", value)} />
    </div>
    {ratingSaveState !== "idle" && <p className={styles.ratingSaveStatus} role={ratingSaveState === "error" ? "alert" : "status"} aria-live={ratingSaveState === "error" ? "assertive" : "polite"}>
      {ratingSaveState === "saving" ? "Enregistrement du ressenti…" : ratingSaveState === "saved" ? "Ressenti enregistré" : "Le ressenti n’a pas pu être enregistré. Réessaie."}
    </p>}
    {correctionMode && <MealCorrectionPanel meal={meal} onCorrection={onCorrection} onCancel={onCancel} />}
  </div>;
}

function MealAnalysisDisclosure(props: MealAnalysisDisclosureProps) {
  return <details className={styles.analysisDetails} open={props.status === "review" || props.correctionMode}>
    <summary>Résultats de l’analyse</summary>
    <MealAnalysisContent {...props} />
  </details>;
}

function MealAnalysisTrigger({ open, controlsId, onToggle, triggerRef }: { open: boolean; controlsId: string; onToggle: () => void; triggerRef?: RefObject<HTMLButtonElement | null> }) {
  return <button ref={triggerRef} className={styles.analysisTrigger} type="button" aria-expanded={open} aria-controls={controlsId} onClick={onToggle}>
    <span aria-hidden="true">{open ? "▾" : "▸"}</span>Résultats de l’analyse
  </button>;
}

function PhotoInput({ slot, onFiles, disabled = false, compact = false, single = false }: { slot: MealSlot; onFiles: (files: File[]) => void | Promise<void>; disabled?: boolean; compact?: boolean; single?: boolean }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const readFiles = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")));
    event.target.value = "";
  };
  // Le mode compact affiche les deux entrées en un seul clic : l’appareil photo
  // et la galerie restent au même niveau, sans écran de choix intermédiaire.
  return <div className={`${styles.photoInput} ${compact ? styles.photoInputCompact : ""} ${single ? styles.photoInputSingle : ""}`}>
    <input ref={cameraRef} className={styles.visuallyHidden} tabIndex={-1} aria-hidden="true" type="file" accept="image/*" capture="environment" aria-label={`Prendre une photo pour ${mealLabelWithArticle(slot)}`} disabled={disabled} onChange={readFiles} />
    <input ref={galleryRef} className={styles.visuallyHidden} tabIndex={-1} aria-hidden="true" type="file" accept="image/*" multiple aria-label={`Choisir des photos pour ${mealLabelWithArticle(slot)}`} disabled={disabled} onChange={readFiles} />
    {single ? <>
      <button className={styles.captureButtonCompact} type="button" aria-label={`Prendre une photo pour ${mealLabelWithArticle(slot)}`} disabled={disabled} onClick={() => cameraRef.current?.click()}><Camera size={17} aria-hidden="true" />Caméra</button>
      <button className={styles.galleryButtonCompact} type="button" aria-label={`Choisir des photos pour ${mealLabelWithArticle(slot)}`} disabled={disabled} onClick={() => galleryRef.current?.click()}><ImagePlus size={17} aria-hidden="true" />Photos</button>
    </> : <>
      <button className={compact ? styles.captureButtonCompact : styles.captureButton} type="button" aria-label={`Prendre une photo pour ${mealLabelWithArticle(slot)}`} disabled={disabled} onClick={() => cameraRef.current?.click()}><Camera size={17} aria-hidden="true" />{compact ? "Caméra" : "Prendre une photo"}</button>
      <button className={compact ? styles.galleryButtonCompact : styles.galleryButton} type="button" aria-label={`Choisir des photos pour ${mealLabelWithArticle(slot)}`} disabled={disabled} onClick={() => galleryRef.current?.click()}><ImagePlus size={17} aria-hidden="true" />{compact ? "Photos" : "Choisir dans Photos"}</button>
    </>}
  </div>;
}

function PhotoStrip({ meal, onRemove, onOrigin, disabled }: { meal: MealRecord; onRemove: (photoId: string) => void; onOrigin: (photoId: string, origin: MealOrigin) => void; disabled: boolean }) {
  const availablePhotos = meal.status === "confirmed" ? [] : meal.photos.filter((photo) =>
    (photo.storageStatus ?? "available") === "available" && Boolean(photo.url),
  );
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

/**
 * Confirmed meals expose only currently available evidence. Successful photo
 * analyses intentionally show a deletion notice after the binary is purged;
 * the existing "Modifier" action remains the single way to change a note or
 * add new evidence.
 */
function MealSourceEvidence({ meal }: { meal: MealRecord }) {
  const photos = meal.status === "confirmed"
    ? []
    : meal.photos.filter((photo) => (photo.storageStatus ?? "available") === "available" && Boolean(photo.url));
  const purgedPhotoCount = meal.status === "confirmed"
    ? meal.photos.length
    : meal.photos.filter((photo) => photo.storageStatus === "purged" || photo.storageStatus === "purge_pending" || !photo.url).length;
  const note = meal.note.trim();
  if (!photos.length && !note && purgedPhotoCount === 0) return null;
  return <details className={styles.sourceDetails}>
    <summary>Photo et note du jour</summary>
    <div className={styles.sourceDetailsBody}>
      {photos.length > 0 && <div className={styles.sourcePhotoGrid} role="list" aria-label={`${photos.length} photo${photos.length > 1 ? "s" : ""} originale${photos.length > 1 ? "s" : ""} du repas`}>
        {photos.map((photo, index) => <figure className={styles.sourcePhoto} role="listitem" key={photo.id}>
          {/* Authenticated photo routes cannot use next/image's static loader. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={`Photo originale ${index + 1} du repas`} width={240} height={180} loading="lazy" decoding="async" />
          <figcaption>Photo {index + 1}</figcaption>
        </figure>)}
      </div>}
      {purgedPhotoCount > 0 && <p className={styles.sourceNote}><span>Preuve photo</span>Photo analysée puis supprimée.</p>}
      {note && <p className={styles.sourceNote}><span>Note du jour</span>{note}</p>}
    </div>
  </details>;
}

function MealCard({ meal, slot, saving, processingFiles, mutationBusy, disabled = false, compactEmpty = false, labCompact = false, mealsCompact = false, openRequest, onFiles, onRemovePhoto, onOrigin, onAnalyze, onCancelAnalysis, onRating, onRetry, onNote, onCorrection, onMarkSkipped, onMarkRecorded, confirmError }: {
  meal: MealRecord | null;
  slot: MealSlot;
  saving: boolean;
  processingFiles: boolean;
  mutationBusy: boolean;
  disabled?: boolean;
  compactEmpty?: boolean;
  labCompact?: boolean;
  mealsCompact?: boolean;
  openRequest?: number;
  onFiles: (files: File[]) => void | Promise<void>;
  onRemovePhoto: (photoId: string) => void;
  onOrigin: (photoId: string, origin: MealOrigin) => void;
  onAnalyze: () => void;
  onCancelAnalysis: () => void;
  onRating: (key: "mouthHeat" | "stomachLoad", value: Rating | null) => void | Promise<boolean>;
  onRetry: () => void;
  onNote: (note: string) => void;
  onCorrection: (correction: MealCorrection) => void;
  onMarkSkipped: () => void;
  onMarkRecorded: () => void;
  confirmError?: string | null;
}) {
  const status = meal?.status ?? "draft";
  const [correctionMode, setCorrectionMode] = useState(false);
  const [ratingSaveState, setRatingSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [analysisChoice, setAnalysisChoice] = useState<{ status: string; open: boolean } | null>(null);
  const analysisOpen = analysisChoice?.status === status ? analysisChoice.open : status === "review";
  const setAnalysisOpen = (next: boolean | ((previous: boolean) => boolean)) => setAnalysisChoice({ status, open: typeof next === "function" ? next(analysisOpen) : next });
  const [entryStarted, setEntryStarted] = useState(false);
  const analysisTriggerRef = useRef<HTMLButtonElement>(null);
  const headingId = `meal-${slot}-title`;
  const analysisContentId = `meal-${slot}-analysis-content`;
  const analyzeHintId = `meal-${slot}-analyze-hint`;
  const hasPhotos = Boolean(meal && status !== "confirmed" && meal.photos.some((photo) =>
    (photo.storageStatus ?? "available") === "available" && Boolean(photo.url),
  ));
  const hasText = Boolean(meal && meal.note.trim().length > 0);
  const hasEvidence = hasPhotos || hasText;
  const canAnalyze = Boolean(meal) && hasEvidence && status === "draft";
  const skipped = meal?.entryState === "skipped";
  const unavailable = disabled && !meal;
  const inactive = skipped || unavailable;
  const visibleStatus = meal ? statusLabel(meal) : unavailable ? "Ignoré" : "";
  const entryOpen = !compactEmpty || Boolean(meal) || entryStarted || Boolean(openRequest);
  const compactEmptyState = compactEmpty && !meal && !inactive && !entryOpen;
  const integratedEmpty = mealsCompact || labCompact;
  const compactDraftCapture = integratedEmpty && !inactive && status === "draft";

  useEffect(() => {
    if (!openRequest || inactive) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`meal-${slot}-note`)?.focus({ preventScroll: true });
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(`meal-${slot}`)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [inactive, openRequest, slot]);

  const handleFiles = (files: File[]) => {
    if (files.length > 0) setEntryStarted(true);
    return onFiles(files);
  };

  const handleRating = async (key: "mouthHeat" | "stomachLoad", value: Rating | null): Promise<boolean> => {
    if (status === "confirmed") {
      setRatingSaveState("saving");
      try {
        const saved = await onRating(key, value);
        const didSave = saved !== false;
        setRatingSaveState(didSave ? "saved" : "error");
        return didSave;
      } catch {
        setRatingSaveState("error");
        return false;
      }
    }
    onRating(key, value);
    return true;
  };

  return <article className={`${styles.mealCard} ${!meal ? styles.mealCardEmpty : ""} ${meal?.status === "confirmed" ? styles.mealCardConfirmed : ""}`} aria-labelledby={headingId} aria-busy={saving || processingFiles}>
    <header className={styles.mealHeader}>
      <div className={styles.mealTitle}><h3 id={headingId} tabIndex={-1}>{SLOT_LABELS[slot]}</h3></div>
      {labCompact ? <div className={styles.labHeaderActions}>
        {meal && visibleStatus ? <span className={styles.mealStatus} data-status={skipped ? "skipped" : meal.status}>{visibleStatus}</span> : null}
        {meal?.analysis && !skipped && (status === "review" || status === "confirmed") ? <MealCompletionControls status={status} saving={saving} mutationBusy={mutationBusy} onEdit={() => { setCorrectionMode(true); setAnalysisOpen(true); }} /> : null}
      </div> : mealsCompact ? <div className={styles.mealHeaderMeta}>
        {meal?.analysis && <span className={styles.mealCalories}>{likelyLabel(meal.analysis.calories)} kcal</span>}
        {visibleStatus && <span className={styles.mealStatus} data-status={skipped ? "skipped" : meal?.status ?? "empty"}>{meal?.status === "confirmed" && !skipped ? <Check size={14} aria-hidden="true" /> : null}{visibleStatus}</span>}
      </div> : visibleStatus && <span className={styles.mealStatus} data-status={skipped ? "skipped" : meal?.status ?? "empty"}>{meal?.status === "confirmed" && !skipped ? <Check size={14} aria-hidden="true" /> : null}{visibleStatus}</span>}
    </header>
    {skipped && <div className={styles.skippedState} role="status"><span>Pas pris · ce créneau est exclu du score.</span><button className={styles.secondaryButton} type="button" disabled={mutationBusy} onClick={onMarkRecorded}>Renseigner ce repas</button></div>}
    {unavailable && <div className={styles.skippedState} role="status">Créneau ignoré dans le journal.</div>}
    {compactDraftCapture ? <div className={compactEmptyState ? styles.emptyMealPrompt : `${styles.mealBody} ${styles.draftMeal}`} role="group" aria-label={meal ? SLOT_LABELS[slot] : `${SLOT_LABELS[slot]} non renseigné`}>
      {hasPhotos && <PhotoStrip key="photos" meal={meal as MealRecord} onRemove={onRemovePhoto} onOrigin={onOrigin} disabled={mutationBusy || disabled || skipped} />}
      <MealTextInput key="text" slot={slot} meal={meal} disabled={processingFiles || mutationBusy || disabled || skipped} onNote={onNote} onAnalyze={onAnalyze} />
      <div className={compactEmptyState ? styles.emptyMealActions : styles.actionsRow}>
        {compactEmptyState ? <PhotoInput slot={slot} onFiles={handleFiles} disabled={processingFiles || disabled || skipped} compact single /> : <PhotoInput slot={slot} onFiles={handleFiles} disabled={processingFiles || disabled || skipped} />}
        {labCompact && <button className={styles.analyzeButton} type="button" aria-label={`Analyser ${mealLabelWithArticle(slot)}`} aria-describedby={hasEvidence ? undefined : analyzeHintId} disabled={!hasEvidence || processingFiles || mutationBusy || disabled || skipped} onClick={onAnalyze}><span>Analyser le repas</span><ArrowRight size={17} aria-hidden="true" /></button>}
        {!skipped && <button className={styles.emptyNoteButton} type="button" disabled={mutationBusy} onClick={onMarkSkipped}>Pas pris</button>}
        {!hasEvidence && <p id={analyzeHintId} className={styles.photoRequired}>Ajoute une photo ou décris ton repas pour lancer l’analyse.</p>}
      </div>
    </div> : null}
    {compactEmptyState && !compactDraftCapture && <div className={styles.emptyMealPrompt} role="group" aria-label={`${SLOT_LABELS[slot]} non renseigné`}>
      <div className={styles.emptyMealActions}>
        <button className={styles.emptyNoteButton} type="button" onClick={() => setEntryStarted(true)}>Écrire</button>
        <PhotoInput slot={slot} onFiles={handleFiles} disabled={processingFiles || disabled} compact />
        <button className={styles.emptyNoteButton} type="button" disabled={mutationBusy} onClick={onMarkSkipped}>Pas pris</button>
      </div>
    </div>}
    {!inactive && status === "accepted" && <div className={styles.analyzingState} role="status" aria-live="polite"><strong>Analyse acceptée</strong><span>Elle continuera en arrière-plan.</span><button className={styles.secondaryButton} type="button" onClick={onCancelAnalysis}>Annuler</button></div>}
    {!inactive && status === "analyzing" && <div className={styles.analyzingState} role="status" aria-live="polite"><span className={styles.progressTrace} aria-hidden="true" /><strong>Analyse en cours</strong><button className={styles.secondaryButton} type="button" onClick={onCancelAnalysis}>Annuler</button></div>}
    {!inactive && !compactEmptyState && !compactDraftCapture && status !== "accepted" && status !== "analyzing" && <div className={`${styles.mealBody} ${status === "draft" ? styles.draftMeal : ""}`}>
      {hasPhotos && <PhotoStrip meal={meal as MealRecord} onRemove={onRemovePhoto} onOrigin={onOrigin} disabled={mutationBusy || disabled || skipped} />}
      <MealTextInput key={`meal-input-${slot}`} slot={slot} meal={meal} disabled={processingFiles || mutationBusy || disabled || skipped} onNote={onNote} onAnalyze={onAnalyze} />
      {status === "draft" && <div className={styles.actionsRow}>
        <PhotoInput slot={slot} onFiles={handleFiles} disabled={processingFiles || disabled || skipped} />
        <button className={styles.analyzeButton} type="button" aria-label={`Analyser ${mealLabelWithArticle(slot)}`} aria-describedby={hasEvidence ? undefined : analyzeHintId} disabled={!canAnalyze || processingFiles || mutationBusy || disabled || skipped} onClick={onAnalyze}>
          <Sparkles size={17} aria-hidden="true" />Analyser
        </button>
        <button className={styles.secondaryButton} type="button" disabled={mutationBusy} onClick={onMarkSkipped}>Pas pris</button>
        {!hasEvidence && <p id={analyzeHintId} className={styles.photoRequired}>Ajoute une photo ou décris ton repas pour lancer l’analyse.</p>}
      </div>}
      {status === "error" && <div className={styles.errorState} role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Analyse interrompue</strong><span>{visibleAnalysisError(meal?.error)}</span></div><button className={styles.retryButton} type="button" disabled={mutationBusy} onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Réessayer</button></div>}
      {status === "confirmed" && !labCompact && meal && <MealSourceEvidence meal={meal} />}
      {(status === "review" || status === "confirmed") && meal?.analysis && <>
        {mealsCompact ? <MealsMealSummary meal={meal} /> : labCompact ? <LabMealSummary meal={meal} /> : <AnalysisSummary meal={meal} />}
        {labCompact && status === "review" && <div className={styles.labAnalysisRow}><MealAnalysisTrigger open={analysisOpen} controlsId={analysisContentId} triggerRef={analysisTriggerRef} onToggle={() => setAnalysisOpen((open) => !open)} /></div>}
        {labCompact && analysisOpen && <div id={analysisContentId} className={styles.labAnalysisContent} onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setAnalysisOpen(false);
            analysisTriggerRef.current?.focus();
          }
        }}>
          <MealAnalysisContent meal={meal} status={status} showExplanation correctionMode={correctionMode} ratingSaveState={ratingSaveState} onRating={handleRating} onCorrection={(correction) => { setCorrectionMode(false); onCorrection(correction); }} onCancel={() => setCorrectionMode(false)} />
        </div>}
        {!labCompact && <>
          <MealAnalysisDisclosure meal={meal} status={status} correctionMode={correctionMode} ratingSaveState={ratingSaveState} onRating={handleRating} onCorrection={(correction) => { setCorrectionMode(false); onCorrection(correction); }} onCancel={() => setCorrectionMode(false)} />
          {confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}
          <MealCompletionControls status={status} saving={saving} mutationBusy={mutationBusy} onEdit={() => setCorrectionMode(true)} />
        </>}
        {labCompact && confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}
      </>}
      {(status === "review" || status === "confirmed") && meal?.error && <p className={styles.confirmError} role="alert">Réanalyse interrompue. L’analyse précédente reste conservée. {visibleAnalysisError(meal.error)}</p>}
    </div>}
  </article>;
}

function MealHeaderMetric({ label, value, unit, target }: { label: string; value: number | null; unit: string; target: number | null }) {
  const valueLabel = value === null ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
  const targetLabel = target === null ? null : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(target);
  return <div className={styles.headerMetric}>
    <span>{label}</span>
    <strong>{valueLabel}<small>{unit}{targetLabel ? ` / ${targetLabel} ${unit}` : ""}</small></strong>
  </div>;
}

function MealPageHeader({ totals, targets, mealsVariant = false, targetsExpanded = false, onToggleTargets }: { totals: DayTotal | null; targets: NutritionTargets; mealsVariant?: boolean; targetsExpanded?: boolean; onToggleTargets?: () => void }) {
  const calories = totals?.calories ?? null;
  const calorieTarget = targets.caloriesKcal.likely;
  const protein = totals?.protein ?? null;
  const proteinTarget = targets.proteinG.likely;
  const calorieProgressValue = calorieProgressForDisplay(calories, calorieTarget);

  if (mealsVariant) {
    return <header className={`${styles.pageHeader} ${styles.mealsPageHeader}`}>
      <h1 id="meal-journal-title">Repas</h1>
      <div className={styles.headerMetrics} role="group" tabIndex={0} aria-label="Synthèse nutritionnelle de la journée">
        <MealHeaderMetric label="Calories" value={totals?.calories ?? null} unit="kcal" target={targets.caloriesKcal.likely} />
        <MealHeaderMetric label="Protéines" value={totals?.protein ?? null} unit="g" target={targets.proteinG.likely} />
        <MealHeaderMetric label="Sucres ajoutés" value={totals?.addedSugar ?? null} unit="g" target={null} />
        <MealHeaderMetric label="Lipides" value={totals?.fat ?? null} unit="g" target={targets.fatG.likely} />
        <MealHeaderMetric label="Glucides" value={totals?.carbs ?? null} unit="g" target={targets.carbsG.likely} />
      </div>
      {onToggleTargets && <button className={styles.mealsTargetButton} type="button" aria-label="Modifier les cibles du jour" aria-expanded={targetsExpanded} aria-controls="meal-target-editor" onClick={onToggleTargets}><Pencil size={14} aria-hidden="true" /></button>}
    </header>;
  }

  return <header className={styles.pageHeader}>
    <div><h1 id="meal-journal-title">Repas</h1></div>
    <div className={styles.dayProgress} aria-label={`Calories : ${calories ?? "indisponibles"} sur ${calorieTarget} kilocalories. Protéines : ${protein ?? "indisponibles"} sur ${proteinTarget} grammes.`}>
      <ScoreRing kind="recovery" label="% calories" score={calorieProgressValue} decorative animate />
    </div>
  </header>;
}

function MealHomeHeader() {
  return <header className={styles.homeHeader}>
    <div><span className={styles.eyebrow}>Journal quotidien</span><h2 id="meal-journal-title">Repas</h2></div>
  </header>;
}

function MealLabHeader({ onAddMeal, addDisabled, hideAddMealButton = false, onToggleTargets, targetsExpanded = false }: { onAddMeal: () => void; addDisabled: boolean; hideAddMealButton?: boolean; onToggleTargets?: () => void; targetsExpanded?: boolean }) {
  return <header className={styles.labHeader}>
    <h2 id="meal-journal-title" className="sr-only">Repas</h2>
    <div className={styles.labHeaderButtons}>
      {onToggleTargets && <button type="button" aria-label="Modifier les cibles du jour" aria-expanded={targetsExpanded} aria-controls="meal-target-editor" onClick={onToggleTargets}><Pencil size={17} aria-hidden="true" /></button>}
      {!hideAddMealButton && <button type="button" aria-label="Ajouter un repas" title="Ajouter un repas" disabled={addDisabled} onClick={onAddMeal}><Plus size={17} aria-hidden="true" /></button>}
    </div>
  </header>;
}

export function MealJournal({ date, today: providedToday, initialData, api, className, disabledSlots = [], selectedDate: selectedDateProp, onDateChange, showDateNavigation = true, sharedDateNavigation, children, historyDays, variant = "page", publishMealTotals = false, initialTargets, initialEffectiveTargets, initialEffortTargetContext, hideAddMealButton = false, allowTargetEditing, designVariant = "v1" }: Props) {
  const today = providedToday ?? todayInLocalTime();
  const requestedDate = date ?? initialData?.date ?? today;
  const initialDate = requestedDate > today ? today : requestedDate;
  const [internalSelectedDate, setInternalSelectedDate] = useState(initialDate);
  const selectedDate = selectedDateProp ?? internalSelectedDate;
  const [data, setData] = useState<MealJournalData | null>(() => initialData ? normalizeData(initialData, initialDate) : null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [loadState, setLoadState] = useState<LoadState>(initialData ? "ready" : "loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filesByPhotoId, setFilesByPhotoId] = useState<Record<string, File>>({});
  const [processingFiles, setProcessingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<Partial<Record<MealSlot, string | null>>>({});
  const [savingSlot, setSavingSlot] = useState<MealSlot | null>(null);
  const [targets, setTargets] = useState<NutritionTargets>(initialTargets ?? DEFAULT_NUTRITION_TARGETS);
  const [effectiveTargets, setEffectiveTargets] = useState<NutritionTargets>(initialEffectiveTargets ?? initialTargets ?? DEFAULT_NUTRITION_TARGETS);
  const [targetsExpanded, setTargetsExpanded] = useState(false);
  const [entryRequest, setEntryRequest] = useState<{ slot: MealSlot; sequence: number } | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const targetEditingEnabled = allowTargetEditing ?? variant !== "lab";
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [analyzingSlots, setAnalyzingSlots] = useState<readonly MealSlot[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ slot: MealSlot; photoId: string } | null>(null);
  const pendingDeleteTrigger = useRef<HTMLElement | null>(null);
  const pendingDeleteCancelRef = useRef<HTMLButtonElement>(null);
  const objectUrls = useRef(new Set<string>());
  const targetSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetBaseRef = useRef(initialTargets ?? DEFAULT_NUTRITION_TARGETS);
  const effectiveTargetsRef = useRef(initialEffectiveTargets ?? initialTargets ?? DEFAULT_NUTRITION_TARGETS);
  const effortTargetContextRef = useRef<EffortTargetContext>(initialEffortTargetContext ?? { effortScore: null, effortCoverage: null, averageEffortScore: null });
  const targetStateDateRef = useRef(initialTargets ? initialDate : null);
  const loadRequestId = useRef(0);
  // Les mutations sont suivies par créneau : une analyse sur un repas ne bloque
  // ni les autres créneaux ni la navigation entre les jours.
  const inFlightSlots = useRef(new Set<MealSlot>());
  const cancelledAnalysisIds = useRef(new Set<string>());
  // Brouillons locaux conservés en mémoire par jour : changer de jour ne doit
  // jamais jeter une note ou une photo non analysée.
  const draftCache = useRef(new Map<string, MealJournalData["meals"]>());
  const ratingSaveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const ratingValues = useRef<Partial<Record<string, { mouthHeat: Rating | null; stomachLoad: Rating | null }>>>({});
  // Seule la préparation des photos bloque la navigation : une analyse en
  // cours sur un créneau n’empêche pas de consulter un autre jour.
  const navigationDisabled = processingFiles;

  const stashLocalDrafts = useCallback((dateKey: string, meals: MealJournalData["meals"]) => {
    const drafts = Object.fromEntries(MEAL_SLOTS.map((slot) => {
      const meal = meals[slot];
      const keep = meal
        && (meal.status === "draft" || meal.status === "error")
        && (meal.note.trim().length > 0 || meal.photos.length > 0);
      return [slot, keep ? meal : null];
    })) as MealJournalData["meals"];
    if (Object.values(drafts).some((meal) => meal !== null)) draftCache.current.set(dateKey, drafts);
    else draftCache.current.delete(dateKey);
  }, []);

  const mergeCachedDrafts = useCallback((loaded: MealJournalData, dateKey: string): MealJournalData => {
    const cached = draftCache.current.get(dateKey);
    const meals = { ...loaded.meals };
    for (const slot of MEAL_SLOTS) {
      if (meals[slot]) continue;
      const draft = cached?.[slot];
      if (draft && (draft.note.trim().length > 0 || draft.photos.length > 0)) {
        meals[slot] = draft;
        continue;
      }
      const storedNote = readStoredDraftNote(dateKey, slot).slice(0, MEAL_NOTE_MAX_LENGTH);
      if (storedNote.trim()) meals[slot] = { ...emptyMeal(dateKey, slot), note: storedNote };
    }
    return { ...loaded, meals };
  }, []);

  const goToDate = useCallback((nextDate: string, options: { push?: boolean } = {}) => {
    if (navigationDisabled) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate > today) return;
    if (nextDate === selectedDate) return;
    loadRequestId.current += 1;
    // Les URL blob des photos locales restent valides : les brouillons sont
    // remis en mémoire et restaurés au retour sur le jour.
    const current = dataRef.current;
    if (current) stashLocalDrafts(current.date, current.meals);
    setFileError(null);
    setConfirmError({});
    setEntryRequest(null);
    setStatusMessage(null);
    setPendingDelete(null);
    setLoadState("loading");
    if (selectedDateProp === undefined) setInternalSelectedDate(nextDate);
    onDateChange?.(nextDate);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextDate === today) url.searchParams.delete("date");
      else url.searchParams.set("date", nextDate);
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      if (options.push === false) window.history.replaceState(window.history.state, "", nextUrl);
      else window.history.pushState(window.history.state, "", nextUrl);
      window.dispatchEvent(new CustomEvent(MEAL_DATE_EVENT, { detail: { date: nextDate } }));
    }
  }, [navigationDisabled, onDateChange, selectedDate, selectedDateProp, stashLocalDrafts, today]);

  const selectDate = useCallback((nextDate: string) => {
    goToDate(nextDate);
  }, [goToDate]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoadState("loading");
    setLoadError(null);
    try {
      const loaded = await (api?.load ? api.load(selectedDate) : defaultLoad(selectedDate));
      if (requestId !== loadRequestId.current) return;
      setData(mergeCachedDrafts(normalizeData(loaded, selectedDate), selectedDate));
      setLoadState("ready");
    } catch (error) {
      if (requestId !== loadRequestId.current) return;
      setLoadState("error");
      setLoadError(error instanceof Error ? error.message : "Les repas ne sont pas disponibles pour le moment.");
    }
  }, [api, mergeCachedDrafts, selectedDate]);

  useEffect(() => {
    if (initialData && selectedDate === initialDate) {
      setData(normalizeData(initialData, selectedDate));
      setLoadState("ready");
      return;
    }
    void load();
  }, [initialData, initialDate, load, selectedDate]);

  // The POST only accepts the job. Polling this small status endpoint lets a
  // resumed tab reconcile the durable result without repeating the XAI call.
  // Keep the dependency stable while a job stays in the same state; otherwise
  // every refresh would recreate the effect and reset its backoff to 2 seconds.
  const activeAnalysisKey = Object.entries(data?.meals ?? {})
    .flatMap(([slot, meal]) => meal && (meal.status === "accepted" || meal.status === "analyzing") ? [`${slot}:${meal.id}:${meal.status}`] : [])
    .join("|");
  useEffect(() => {
    if (api || !activeAnalysisKey) return;
    const activeMeals = Object.entries(dataRef.current?.meals ?? {}).flatMap(([slot, meal]) =>
      meal && (meal.status === "accepted" || meal.status === "analyzing") ? [{ slot: slot as MealSlot, meal }] : [],
    );
    if (!activeMeals.length) return;
    let cancelled = false;
    const refresh = async () => {
      await Promise.all(activeMeals.map(async ({ slot, meal }) => {
        if (cancelledAnalysisIds.current.has(meal.id)) return;
        try {
          const response = await fetchMeal(`/api/meals/${encodeURIComponent(meal.id)}/analyze`, { cache: "no-store" }, { operation: "load" });
          const body = await readJson(response) as { meal?: unknown };
          if (cancelled || !body.meal) return;
          const next = normalizeMeal(apiMealToRecord(body.meal), selectedDate, slot);
          setData((current) => current ? { ...current, meals: { ...current.meals, [slot]: next } } : current);
        } catch {
          // A temporary reconnect failure must not turn a durable job into a
          // false error. The next tick or visibility event retries it.
        }
      }));
    };
    let timer: number | null = null;
    let delayIndex = 0;
    const delays = [2_000, 5_000, 10_000, 20_000, 30_000];
    const schedule = () => {
      if (cancelled) return;
      timer = window.setTimeout(async () => {
        await refresh();
        delayIndex = Math.min(delayIndex + 1, delays.length - 1);
        schedule();
      }, delays[delayIndex]);
    };
    void refresh().finally(schedule);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (timer !== null) window.clearTimeout(timer);
      delayIndex = 0;
      void refresh().finally(schedule);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeAnalysisKey, api, selectedDate]);

  const controlledDate = useRef(selectedDateProp);
  useEffect(() => {
    if (selectedDateProp === undefined || controlledDate.current === selectedDateProp) return;
    controlledDate.current = selectedDateProp;
    const current = dataRef.current;
    if (current) stashLocalDrafts(current.date, current.meals);
    setData(null);
    setFileError(null);
    setConfirmError({});
    setLoadState("loading");
    setLoadError(null);
  }, [selectedDateProp, stashLocalDrafts]);

  useEffect(() => () => { objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  // Autosauvegarde locale des notes non analysées, par jour et par créneau.
  // Un rechargement ou un changement de jour ne perd plus le texte saisi.
  useEffect(() => {
    if (typeof window === "undefined" || !data) return;
    try {
      for (const slot of MEAL_SLOTS) {
        const meal = data.meals[slot];
        const key = draftNoteStorageKey(data.date, slot);
        if (meal && (meal.status === "draft" || meal.status === "error") && meal.note.trim()) {
          window.localStorage.setItem(key, meal.note.slice(0, MEAL_NOTE_MAX_LENGTH));
        } else {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Stockage indisponible : le brouillon reste conservé en mémoire.
    }
  }, [data]);

  // Le bouton précédent du navigateur revient au jour précédent du journal.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      const params = new URL(window.location.href).searchParams;
      const raw = params.get("date");
      const next = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;
      if (next !== dataRef.current?.date) goToDate(next, { push: false });
      else if (selectedDateProp === undefined) setInternalSelectedDate(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [goToDate, selectedDateProp, today]);

  // Dialogue de suppression photo : focus d’entrée, Échap et retour au
  // déclencheur, sans bloquer le reste du journal.
  useEffect(() => {
    if (!pendingDelete) return;
    pendingDeleteCancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPendingDelete(null);
        pendingDeleteTrigger.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.getElementById("meal-photo-delete-dialog");
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pendingDelete]);

  const applyLoadedTargets = useCallback((nextBase: NutritionTargets, nextEffective: NutritionTargets, nextContext: EffortTargetContext, targetDate: string) => {
    const baseUnchanged = JSON.stringify(targetBaseRef.current) === JSON.stringify(nextBase);
    const merged = mergeDailyNutritionTargets({
      current: effectiveTargetsRef.current,
      next: nextEffective,
      sameDay: targetStateDateRef.current === targetDate,
      baseUnchanged,
    });
    targetStateDateRef.current = targetDate;
    targetBaseRef.current = nextBase;
    effortTargetContextRef.current = nextContext;
    effectiveTargetsRef.current = merged;
    setTargets(nextBase);
    setEffectiveTargets(merged);
  }, []);

  const refreshTargets = useCallback(async (signal?: AbortSignal) => {
    const localTargets = loadNutritionTargets();
    if (targetStateDateRef.current !== selectedDate) {
      targetStateDateRef.current = selectedDate;
      targetBaseRef.current = localTargets;
      effortTargetContextRef.current = { effortScore: null, effortCoverage: null, averageEffortScore: null };
      effectiveTargetsRef.current = localTargets;
      setTargets(localTargets);
      setEffectiveTargets(localTargets);
    }
    const url = `/api/nutrition-targets?date=${encodeURIComponent(selectedDate)}`;
    const response = await fetch(url, { cache: "no-store", signal });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Les objectifs nutritionnels ne sont pas disponibles.");
    const parsed = parseNutritionTargets(body.targets);
    if (!parsed) return;
    const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
    const context: EffortTargetContext = {
      effortScore: numberOrNull(body.effortScore),
      effortCoverage: numberOrNull(body.effortCoverage),
      averageEffortScore: numberOrNull(body.averageEffortScore),
    };
    const serverEffective = parseNutritionTargets(body.effectiveTargets) ?? nutritionTargetsForEffort(parsed, context);
    const hasCustomizedLocalTargets = JSON.stringify(localTargets) !== JSON.stringify(DEFAULT_NUTRITION_TARGETS);
    if (body.persisted === false && hasCustomizedLocalTargets) {
      const migrated = await fetch("/api/nutrition-targets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets: localTargets }), signal });
      if (!migrated.ok) throw new Error("Les objectifs locaux n’ont pas pu être synchronisés.");
      applyLoadedTargets(localTargets, nutritionTargetsForEffort(localTargets, context), context, selectedDate);
      return;
    }
    applyLoadedTargets(parsed, serverEffective, context, selectedDate);
    saveNutritionTargets(parsed);
  }, [applyLoadedTargets, selectedDate]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshTargets(controller.signal).catch((error) => {
      if (error instanceof Error && error.name !== "AbortError") setTargetError("Objectifs locaux utilisés : la synchronisation Soma est indisponible.");
    });
    const interval = window.setInterval(() => {
      void refreshTargets().catch(() => undefined);
    }, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [refreshTargets]);

  useEffect(() => () => {
    if (targetSaveTimer.current) clearTimeout(targetSaveTimer.current);
  }, []);

  const currentDayTotal = data?.date === selectedDate ? sumLikelyDay(data.meals) : null;
  const emitMealTotals = useCallback(() => {
    if (!publishMealTotals || typeof window === "undefined") return;
    const calorieTarget = effectiveTargets.caloriesKcal.likely > 0 ? effectiveTargets.caloriesKcal.likely : null;
    const calories = currentDayTotal?.calories ?? null;
    const calorieProgress = calorieProgressForDisplay(calories, calorieTarget ?? 0);
    window.dispatchEvent(new CustomEvent(MEAL_TOTALS_EVENT, {
      detail: { date: selectedDate, isToday: selectedDate === today, calories, calorieTarget, calorieProgress },
    }));
  }, [currentDayTotal?.calories, effectiveTargets.caloriesKcal.likely, publishMealTotals, selectedDate, today]);

  useEffect(() => {
    if (!publishMealTotals || typeof window === "undefined") return;
    window.addEventListener(MEAL_TOTALS_REQUEST_EVENT, emitMealTotals);
    emitMealTotals();
    return () => window.removeEventListener(MEAL_TOTALS_REQUEST_EVENT, emitMealTotals);
  }, [emitMealTotals, publishMealTotals]);

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
      targetBaseRef.current = next;
      const nextEffective = nutritionTargetsForEffort(next, effortTargetContextRef.current);
      effectiveTargetsRef.current = nextEffective;
      setEffectiveTargets(nextEffective);
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

  const changeEntryState = async (slot: MealSlot, entryState: MealEntryState) => {
    if (inFlightSlots.current.has(slot)) return;
    const current = dataRef.current?.meals[slot] ?? emptyMeal(selectedDate, slot);
    const previous = current;
    inFlightSlots.current.add(slot);
    setSavingSlot(slot);
    setConfirmError((errors) => ({ ...errors, [slot]: null }));
    updateMeal(slot, (meal) => ({
      ...meal,
      entryState,
      error: null,
    }));
    try {
      const saved = await (api?.setEntryState
        ? api.setEntryState({ ...current, entryState }, entryState)
        : defaultSetEntryState({ ...current, entryState }, entryState));
      const nextMeal = normalizeMeal({ ...current, ...saved, entryState }, selectedDate, slot);
      setData((loaded) => loaded ? { ...loaded, meals: { ...loaded.meals, [slot]: nextMeal } } : loaded);
      setStatusMessage(entryState === "skipped"
        ? `${SLOT_LABELS[slot]} marqué comme « pas pris ». Ce créneau ne lance aucune analyse.`
        : `${SLOT_LABELS[slot]} réactivé. Tu peux maintenant le renseigner.`);
      return true;
    } catch (error) {
      setData((loaded) => loaded ? { ...loaded, meals: { ...loaded.meals, [slot]: previous } } : loaded);
      setConfirmError((errors) => ({ ...errors, [slot]: error instanceof Error ? error.message : "Le statut du créneau n’a pas pu être enregistré." }));
      return false;
    } finally {
      inFlightSlots.current.delete(slot);
      setSavingSlot(null);
    }
  };

  // Pont d’usage avec les recettes habituelles : « Utiliser » copie les
  // ingrédients dans la note du premier créneau libre. La photo et la note du
  // jour restent la preuve principale.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onRecipeNote = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text?.trim().slice(0, MEAL_NOTE_MAX_LENGTH);
      if (!text) return;
      const current = dataRef.current;
      const fallbackSlot = MEAL_SLOTS.find((slot) => !disabledSlots.includes(slot)) ?? "lunch";
      const target = current ? firstAvailableMealSlot(current.meals, disabledSlots) : fallbackSlot;
      if (!target) {
        setStatusMessage("Journal complet : modifie un repas pour y ajouter ce repère.");
        return;
      }
      const existing = current?.meals[target]?.note.trim() ?? "";
      const combined = existing ? `${existing}\n${text}`.slice(0, MEAL_NOTE_MAX_LENGTH) : text;
      updateMeal(target, (meal) => ({ ...meal, note: combined, status: "draft", error: null }));
      setStatusMessage(`Repère copié dans ${SLOT_LABELS[target].toLowerCase()}. La photo et ta note du jour priment.`);
      setEntryRequest((previous) => ({ slot: target, sequence: (previous?.sequence ?? 0) + 1 }));
    };
    window.addEventListener(RECIPE_TO_DAY_NOTE_EVENT, onRecipeNote);
    return () => window.removeEventListener(RECIPE_TO_DAY_NOTE_EVENT, onRecipeNote);
  }, [disabledSlots, updateMeal]);

  const addFiles = async (slot: MealSlot, incoming: File[]) => {
    if (!incoming.length || inFlightSlots.current.has(slot)) return;
    inFlightSlots.current.add(slot);
    setProcessingFiles(true);
    setFileError(null);
    const prepared: File[] = [];
    const normalizationStartedAt = Date.now();
    try {
      // Keep memory bounded on mobile while avoiding the fully sequential
      // normalization that made a six-photo capture feel unnecessarily slow.
      for (let index = 0; index < incoming.length; index += 2) {
        const batch = await Promise.all(incoming.slice(index, index + 2).map((file) => normalizeMealImage(file)));
        prepared.push(...batch);
      }
      console.info("[meal-analysis] stage", { stage: "normalization", photoCount: prepared.length, durationMs: Date.now() - normalizationStartedAt });
    } catch (error) {
      console.warn("[meal-analysis] stage failed", { stage: "normalization", durationMs: Date.now() - normalizationStartedAt });
      setFileError(error instanceof Error ? error.message : "Cette photo n’a pas pu être préparée. Prends-la à nouveau en JPEG ou PNG.");
      setProcessingFiles(false);
      inFlightSlots.current.delete(slot);
      return;
    }
    const currentMeal = dataRef.current?.meals[slot] ?? emptyMeal(selectedDate, slot);
    const activePhotoCount = currentMeal.status === "confirmed" ? 0 : currentMeal.photos.filter((photo) => (photo.storageStatus ?? "available") === "available").length;
    const limitMessage = mealPhotoLimitMessage(activePhotoCount, prepared.length);
    const accepted = prepared.slice(0, Math.max(0, MAX_MEAL_PHOTOS - activePhotoCount));
    if (limitMessage) setFileError(limitMessage);
    const newPhotos = accepted.map((file) => {
      const id = randomId("photo");
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return { id, url, filename: file.name, origin: null } satisfies MealPhoto;
    });
    if (newPhotos.length) {
      setFilesByPhotoId((files) => ({ ...files, ...Object.fromEntries(newPhotos.map((photo, index) => [photo.id, accepted[index]])) }));
      updateMeal(slot, (meal) => ({ ...meal, photos: [...meal.photos, ...newPhotos], status: "draft", error: null }));
    }
    setProcessingFiles(false);
    inFlightSlots.current.delete(slot);
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

  const removePhoto = (slot: MealSlot, photoId: string) => {
    const meal = dataRef.current?.meals[slot];
    if (!meal || inFlightSlots.current.has(slot)) return;
    const localPhoto = Boolean(filesByPhotoId[photoId]) || meal.id.startsWith("meal-");
    // Une photo locale non envoyée part sans confirmation. Une photo déjà
    // enregistrée passe par une modale avec retour au déclencheur.
    if (localPhoto) {
      removePhotoFromState(slot, photoId);
      return;
    }
    pendingDeleteTrigger.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setPendingDelete({ slot, photoId });
  };

  const cancelPendingDelete = () => {
    setPendingDelete(null);
    pendingDeleteTrigger.current?.focus();
  };

  const confirmPendingDelete = async () => {
    const pending = pendingDelete;
    if (!pending) return;
    const meal = dataRef.current?.meals[pending.slot];
    setPendingDelete(null);
    if (!meal || inFlightSlots.current.has(pending.slot)) {
      pendingDeleteTrigger.current?.focus();
      return;
    }
    inFlightSlots.current.add(pending.slot);
    try {
      await (api?.removePhoto ? api.removePhoto(meal.id, pending.photoId) : defaultRemovePhoto(meal.id, pending.photoId));
      removePhotoFromState(pending.slot, pending.photoId);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Cette photo n’a pas pu être supprimée.");
    } finally {
      inFlightSlots.current.delete(pending.slot);
      pendingDeleteTrigger.current?.focus();
    }
  };

  const setNote = (slot: MealSlot, note: string) => {
    updateMeal(slot, (current) => ({ ...current, note: note.slice(0, MEAL_NOTE_MAX_LENGTH), status: "draft", error: null }));
  };

  const setPhotoOrigin = async (slot: MealSlot, photoId: string, origin: MealOrigin) => {
    const meal = data?.meals[slot];
    updateMeal(slot, (current) => ({
      ...current,
      photos: current.photos.map((photo) => photo.id === photoId ? { ...photo, origin } : photo),
      status: "draft",
      error: null,
    }));
    if (!meal || meal.id.startsWith("meal-") || photoId.startsWith("photo-")) return;
    try {
      if (api?.updatePhotoOrigin) await api.updatePhotoOrigin(meal.id, photoId, origin);
      else await readJson(await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(meal.id)}/photos/${encodeURIComponent(photoId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin }) }, 15_000, { operation: "update" }));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "L’origine de la photo n’a pas pu être enregistrée.");
    }
  };

  const saveMeal = async (meal: MealRecord, status: MealStatus = "confirmed", options: { queued?: boolean; announce?: boolean } = {}): Promise<boolean> => {
    if (!options.queued && inFlightSlots.current.has(meal.slot)) return false;
    inFlightSlots.current.add(meal.slot);
    setSavingSlot(meal.slot);
    setConfirmError((previous) => ({ ...previous, [meal.slot]: null }));
    try {
      const saved = await (api?.save ? api.save({ ...meal, status }) : defaultSave({ ...meal, status }));
      const nextMeal = normalizeMeal({ ...meal, ...saved, note: typeof saved.note === "string" ? saved.note : meal.note, status }, selectedDate, meal.slot);
      setData((current) => current ? { ...current, meals: { ...current.meals, [meal.slot]: nextMeal } } : current);
      if (!options.queued && options.announce !== false && status === "confirmed") {
        setStatusMessage("Repas confirmé. La photo et la note restent modifiables.");
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            document.getElementById(`meal-${meal.slot}-title`)?.focus({ preventScroll: true });
          });
        }
      }
      return true;
    } catch (error) {
      setConfirmError((previous) => ({ ...previous, [meal.slot]: error instanceof Error ? error.message : "Le repas n’a pas pu être enregistré." }));
      updateMeal(meal.slot, (current) => ({ ...current, status: current.analysis ? "review" : "draft", error: error instanceof Error ? error.message : "Le repas n’a pas pu être enregistré." }));
      return false;
    } finally {
      inFlightSlots.current.delete(meal.slot);
      setSavingSlot(null);
    }
  };

  const analyzeMeal = async (slot: MealSlot, correction?: MealCorrection) => {
    const meal = dataRef.current?.meals[slot];
    if (!meal || inFlightSlots.current.has(slot)) return;
    const activePhotos = meal.status === "confirmed" ? [] : meal.photos.filter((photo) => (photo.storageStatus ?? "available") === "available");
    const hasPhotosForAnalyze = activePhotos.length > 0;
    const hasTextForAnalyze = Boolean(meal.note.trim());
    if (correction) {
      // Grok receives the correction together with the current evidence and
      // recalculates the complete analysis in one request.
    } else if (hasPhotosForAnalyze) {
      if (activePhotos.length > MAX_MEAL_PHOTOS) {
        setFileError(`Ce repas contient ${activePhotos.length} photos, mais ${MAX_MEAL_PHOTOS} au maximum sont autorisées. Retire-en avant de relancer l’analyse.`);
        return;
      }
    } else if (!hasTextForAnalyze) {
      setFileError("Ajoute une photo ou décris ton repas avant de lancer l’analyse.");
      return;
    }
    inFlightSlots.current.add(slot);
    setAnalyzingSlots((previous) => previous.includes(slot) ? previous : [...previous, slot]);
    cancelledAnalysisIds.current.delete(meal.id);
    updateMeal(slot, (current) => ({ ...current, status: "accepted", error: null }));
    try {
      const reconcileUploadedPhotos = (pairs: Array<{ localPhotoId: string; photo: MealPhoto }>) => {
        const uploadedByLocalId = new Map(pairs.map((pair) => [pair.localPhotoId, pair.photo]));
        pairs.forEach(({ localPhotoId }) => {
          const localPhoto = meal.photos.find((photo) => photo.id === localPhotoId);
          if (localPhoto && objectUrls.current.has(localPhoto.url)) {
            URL.revokeObjectURL(localPhoto.url);
            objectUrls.current.delete(localPhoto.url);
          }
        });
        setFilesByPhotoId((current) => {
          const next = { ...current };
          pairs.forEach(({ localPhotoId }) => delete next[localPhotoId]);
          return next;
        });
        updateMeal(slot, (current) => ({
          ...current,
          photos: current.photos.map((photo) => uploadedByLocalId.get(photo.id) ?? photo),
        }));
      };
      const photoFiles = meal.photos.map((photo) => {
        const file = filesByPhotoId[photo.id];
        return file ? { photoId: photo.id, file } : null;
      }).filter((entry): entry is { photoId: string; file: File } => Boolean(entry));
      const files = photoFiles.map((entry) => entry.file);
      const analyzed = await (api?.analyze ? api.analyze({ date: selectedDate, slot, meal, files, photoFiles, ...(correction ? { correction } : {}) }) : defaultAnalyze({ date: selectedDate, slot, meal, files, photoFiles, ...(correction ? { correction } : {}) }, { onPhotosUploaded: reconcileUploadedPhotos }));
      if (cancelledAnalysisIds.current.has(meal.id)) {
        // Annulation demandée pendant l’envoi : le résultat tardif est ignoré
        // et le brouillon local est conservé tel quel.
        updateMeal(slot, (current) => ({ ...current, status: current.analysis ? "review" : "draft", error: null }));
        return;
      }
      const nextStatus = analyzed.status === "accepted" || analyzed.status === "analyzing"
        ? analyzed.status
        : (analyzed.analysis || analyzed.status === "confirmed")
          ? "confirmed"
          : "draft";
      updateMeal(slot, (current) => ({ ...current, ...normalizeMeal({ ...analyzed, note: typeof analyzed.note === "string" && analyzed.note ? analyzed.note : current.note, photos: analyzed.photos?.length ? analyzed.photos : current.photos, status: nextStatus, error: null }, selectedDate, slot), status: nextStatus }));
    } catch (error) {
      updateMeal(slot, (current) => ({ ...current, status: current.analysis ? "review" : "error", error: error instanceof Error ? error.message : "L’analyse n’a pas pu aboutir." }));
    } finally {
      inFlightSlots.current.delete(slot);
      setAnalyzingSlots((previous) => previous.filter((entry) => entry !== slot));
    }
  };

  const cancelAnalysis = (slot: MealSlot) => {
    const meal = dataRef.current?.meals[slot];
    if (!meal) return;
    cancelledAnalysisIds.current.add(meal.id);
    inFlightSlots.current.delete(slot);
    setAnalyzingSlots((previous) => previous.filter((entry) => entry !== slot));
    updateMeal(slot, (current) => ({ ...current, status: current.analysis ? "review" : "draft", error: null }));
    setStatusMessage("Analyse annulée. Le brouillon est conservé.");
  };

  const setRating = async (slot: MealSlot, key: "mouthHeat" | "stomachLoad", value: Rating | null) => {
    const meal = data?.meals[slot];
    if (!meal) return false;
    const ratingKey = `${selectedDate}:${slot}`;
    const currentRatings = ratingValues.current[ratingKey] ?? { mouthHeat: meal.mouthHeat, stomachLoad: meal.stomachLoad };
    const nextRatings = { ...currentRatings, [key]: value };
    ratingValues.current[ratingKey] = nextRatings;
    const next = { ...meal, ...nextRatings } as MealRecord;
    updateMeal(slot, (current) => ({ ...current, ...nextRatings }));
    if (next.mouthHeat !== null && next.stomachLoad !== null) {
      setConfirmError((previous) => previous[slot] ? { ...previous, [slot]: null } : previous);
    }
    if (meal.status === "confirmed") {
      const previous = ratingSaveQueue.current;
      const request = previous.catch(() => false).then(() => saveMeal(next, "confirmed", { queued: true }));
      ratingSaveQueue.current = request;
      const saved = await request;
      if (ratingSaveQueue.current === request) ratingSaveQueue.current = Promise.resolve(saved);
      return saved;
    }
    return true;
  };

  // The date rail is a seven-day contract in every journal surface. Keep the
  // lower bound here so a route cannot accidentally render only six days.
  // Les flèches et le choix direct d’un jour couvrent au moins J-30 sans
  // édition manuelle de l’URL ; la bande conserve le rythme hebdomadaire.
  const historyDates = mealHistoryDates(selectedDate, today, Math.max(7, historyDays ?? 7));
  // Keep the newest day on the left, like the shared Personal Lab selector.
  const visibleHistoryDates = historyDates;
  const showDateArrows = variant === "lab" || variant === "meals";
  const showDatePicker = showDateNavigation && (variant === "lab" || variant === "meals");
  const internalDateNavigation = showDateNavigation ? <>
    <nav className={`${styles.historyNavigation} ${showDateArrows ? styles.historyNavigationWithArrows : ""} personal-lab-day-strip`} aria-label="Historique des repas">
      {showDateArrows && <button className={styles.historyArrow} type="button" disabled={navigationDisabled} aria-label="Jour précédent" onClick={() => selectDate(shiftIsoDate(selectedDate, -1))}>‹</button>}
      <div className={`${styles.weekStrip} ${variant === "meals" ? styles.mealsWeekStrip : ""} personal-lab-day-strip__days`} role="group" aria-label="Jours disponibles">
        {visibleHistoryDates.map((historyDate) => {
          const label = compactDayLabel(historyDate, today);
          return <button key={historyDate} type="button" disabled={navigationDisabled} className={historyDate === selectedDate ? styles.weekDaySelected : styles.weekDay} aria-pressed={historyDate === selectedDate} aria-current={historyDate === selectedDate ? "date" : undefined} aria-label={formatDate(historyDate)} onClick={() => selectDate(historyDate)}><span>{label.weekday}</span><small>{label.day}</small><span className="sr-only">{formatDate(historyDate)}</span></button>;
        })}
      </div>
      {showDateArrows && <button className={styles.historyArrow} type="button" disabled={navigationDisabled || selectedDate >= today} aria-label="Jour suivant" onClick={() => selectDate(shiftIsoDate(selectedDate, 1))}>›</button>}
    </nav>
    {showDatePicker && <div className={styles.datePickerRow}>
      <label htmlFor="meal-date-picker">Choisir un jour</label>
      <input id="meal-date-picker" className={styles.datePicker} type="date" value={selectedDate} max={today} min={shiftIsoDate(today, -89)} disabled={navigationDisabled} onChange={(event) => { if (event.target.value) selectDate(event.target.value); }} />
    </div>}
  </> : null;
  const dateNavigation = sharedDateNavigation ?? internalDateNavigation;
  const availableMealSlot = data ? firstAvailableMealSlot(data.meals, disabledSlots) : null;
  const openAvailableMeal = () => {
    if (!availableMealSlot || navigationDisabled) return;
    setEntryRequest((current) => ({ slot: availableMealSlot, sequence: (current?.sequence ?? 0) + 1 }));
  };
  const pageHeader = variant === "home" ? <MealHomeHeader /> : variant === "lab" ? <MealLabHeader onAddMeal={openAvailableMeal} addDisabled={!availableMealSlot || navigationDisabled} hideAddMealButton={hideAddMealButton} onToggleTargets={targetEditingEnabled ? () => setTargetsExpanded((expanded) => !expanded) : undefined} targetsExpanded={targetsExpanded} /> : <MealPageHeader totals={currentDayTotal} targets={variant === "meals" ? targets : effectiveTargets} mealsVariant={variant === "meals"} targetsExpanded={targetsExpanded} onToggleTargets={variant === "meals" ? () => setTargetsExpanded((expanded) => !expanded) : undefined} />;
  const rootClass = [styles.root, className, variant === "lab" ? styles.labRoot : "", variant === "meals" ? styles.mealsPageRoot : ""].filter(Boolean).join(" ");

  if (loadState === "loading") return <section className={rootClass} aria-labelledby="meal-journal-title">{pageHeader}{dateNavigation}<div className={styles.loadingState} role="status" aria-live="polite"><span className={styles.progressTrace} aria-hidden="true" /><span>Chargement des repas…</span></div></section>;
  if (loadState === "error") return <section className={rootClass} aria-labelledby="meal-journal-title">{pageHeader}{dateNavigation}<div className={styles.errorState} role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Impossible de charger les repas</strong><span>{loadError}</span></div><button className={styles.retryButton} type="button" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" />Réessayer</button></div></section>;

  const readyData = data ?? emptyData(selectedDate);
  const slotBusy = (slot: MealSlot) => savingSlot === slot || analyzingSlots.includes(slot);
  return <section className={rootClass} aria-labelledby="meal-journal-title">
    {pageHeader}
    {dateNavigation}
    {statusMessage && <p className={styles.saveNotice} role="status">{statusMessage}</p>}
    {variant !== "lab" && variant !== "meals" && <div className={styles.targetControls}>
      <button className={styles.targetEditButton} type="button" aria-label="Modifier les cibles du jour" aria-expanded={targetsExpanded} aria-controls="meal-target-editor" onClick={() => setTargetsExpanded((expanded) => !expanded)}><Pencil size={16} aria-hidden="true" /></button>
    </div>}
    {targetsExpanded && targetEditingEnabled && <div id="meal-target-editor" className={styles.targetEditor}>
      <label><span>Calories (kcal)</span><input type="number" min="0" inputMode="numeric" aria-label="Cible calories, valeur estimée" value={targets.caloriesKcal.likely} onChange={(event) => updateTargetLikely("caloriesKcal", event.target.value)} /></label>
      <label><span>Protéines (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible protéines, valeur estimée" value={targets.proteinG.likely} onChange={(event) => updateTargetLikely("proteinG", event.target.value)} /></label>
      <label><span>Lipides (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible lipides, valeur estimée" value={targets.fatG.likely} onChange={(event) => updateTargetLikely("fatG", event.target.value)} /></label>
      <label><span>Glucides (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible glucides, valeur estimée" value={targets.carbsG.likely} onChange={(event) => updateTargetLikely("carbsG", event.target.value)} /></label>
      <label><span>Fibres (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible fibres, valeur estimée" value={targets.fiberG.likely} onChange={(event) => updateTargetLikely("fiberG", event.target.value)} /></label>
    </div>}
    {targetError && <p className={styles.confirmError} role="status">{targetError}</p>}
    {fileError && <div className={styles.fileError} role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{fileError}</span><button className={styles.dismissError} type="button" onClick={() => setFileError(null)} aria-label="Fermer le message photo"><X size={16} aria-hidden="true" /></button></div>}
    {variant === "meals" ? <div className={styles.mealsWorkbench}>
      <section className={styles.mealsJournalPanel} aria-labelledby="meals-journal-panel-title">
        <header className={styles.mealsJournalHeader}>
          <h2 id="meals-journal-panel-title">Journal des repas</h2>
          <button type="button" aria-label="Ajouter un repas" title="Ajouter un repas" disabled={!availableMealSlot || navigationDisabled} onClick={openAvailableMeal}><Plus size={17} aria-hidden="true" /></button>
        </header>
        <div className={styles.mealList}>{MEAL_SLOTS.map((slot) => {
      const meal = readyData.meals[slot] ?? null;
          return <div id={`meal-${slot}`} key={`${selectedDate}-${slot}`}><MealCard meal={meal} slot={slot} compactEmpty mealsCompact openRequest={entryRequest?.slot === slot ? entryRequest.sequence : undefined} disabled={disabledSlots.includes(slot)} saving={savingSlot === slot} processingFiles={processingFiles} mutationBusy={slotBusy(slot)} confirmError={confirmError[slot]} onFiles={(files) => addFiles(slot, files)} onRemovePhoto={(photoId) => removePhoto(slot, photoId)} onOrigin={(photoId, origin) => void setPhotoOrigin(slot, photoId, origin)} onAnalyze={() => void analyzeMeal(slot)} onCancelAnalysis={() => cancelAnalysis(slot)} onCorrection={(correction) => void analyzeMeal(slot, correction)} onRating={(key, value) => setRating(slot, key, value)} onRetry={() => void analyzeMeal(slot)} onNote={(note) => setNote(slot, note)} onMarkSkipped={() => void changeEntryState(slot, "skipped")} onMarkRecorded={() => void changeEntryState(slot, "recorded")} /></div>;
        })}</div>
      </section>
      <div className={styles.mealsSecondary}>{children}</div>
    </div> : <div className={styles.mealList}>{MEAL_SLOTS.map((slot) => {
        const meal = readyData.meals[slot] ?? null;
        return <div id={`meal-${slot}`} key={`${selectedDate}-${slot}`}>{
          variant === "lab" ? (
            <LabMealCard
              meal={meal}
              slot={slot}
              designVariant={designVariant}
              disabled={disabledSlots.includes(slot)}
              saving={savingSlot === slot}
              processingFiles={processingFiles}
              mutationBusy={slotBusy(slot)}
              confirmError={confirmError[slot]}
              onFiles={(files) => addFiles(slot, files)}
              onRemovePhoto={(photoId) => removePhoto(slot, photoId)}
              onAnalyze={() => void analyzeMeal(slot)}
              onCancelAnalysis={() => cancelAnalysis(slot)}
              onNote={(note) => setNote(slot, note)}
              onEdit={() => setNote(slot, meal?.note?.trim() || meal?.analysis?.dishType || "")}
              onMarkSkipped={() => void changeEntryState(slot, "skipped")}
            />
          ) : (
            <MealCard meal={meal} slot={slot} compactEmpty={variant !== "page"} labCompact={false} openRequest={entryRequest?.slot === slot ? entryRequest.sequence : undefined} disabled={disabledSlots.includes(slot)} saving={savingSlot === slot} processingFiles={processingFiles} mutationBusy={slotBusy(slot)} confirmError={confirmError[slot]} onFiles={(files) => addFiles(slot, files)} onRemovePhoto={(photoId) => removePhoto(slot, photoId)} onOrigin={(photoId, origin) => void setPhotoOrigin(slot, photoId, origin)} onAnalyze={() => void analyzeMeal(slot)} onCancelAnalysis={() => cancelAnalysis(slot)} onCorrection={(correction) => void analyzeMeal(slot, correction)} onRating={(key, value) => setRating(slot, key, value)} onRetry={() => void analyzeMeal(slot)} onNote={(note) => setNote(slot, note)} onMarkSkipped={() => void changeEntryState(slot, "skipped")} onMarkRecorded={() => void changeEntryState(slot, "recorded")} />
          )
        }</div>;
      })}</div>}
    {pendingDelete && <div className={styles.deleteBackdrop} onClick={(event) => { if (event.target === event.currentTarget) cancelPendingDelete(); }}>
      <div id="meal-photo-delete-dialog" className={styles.deleteDialog} role="alertdialog" aria-modal="true" aria-labelledby="meal-photo-delete-title" aria-describedby="meal-photo-delete-description">
        <h3 id="meal-photo-delete-title">Supprimer cette photo ?</h3>
        <p id="meal-photo-delete-description">Elle sera retirée du {SLOT_LABELS[pendingDelete.slot].toLowerCase()}. Les photos déjà analysées restent décrites dans la note.</p>
        <div className={styles.deleteActions}>
          <button ref={pendingDeleteCancelRef} className={styles.secondaryButton} type="button" onClick={cancelPendingDelete}>Annuler</button>
          <button className={styles.confirmButton} type="button" onClick={() => void confirmPendingDelete()}>Supprimer</button>
        </div>
      </div>
    </div>}
  </section>;
}

export default MealJournal;
