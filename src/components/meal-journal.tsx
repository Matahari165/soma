"use client";

import {
  AlertCircle,
  Camera,
  Check,
  ImagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";
import { MAX_MEAL_PHOTOS, type MealFoodCourse } from "@/domain/meals";
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
  loadNutritionTargets,
  parseNutritionTargets,
  saveNutritionTargets,
  type NutritionTargets,
} from "@/domain/nutrition-targets";
import { fetchMeal, fetchMealWithTimeout } from "@/services/meal-client";
import { normalizeMealImage } from "@/services/meal-image";
import styles from "./meal-journal.module.css";

export { apiMealToRecord, MEAL_SLOTS };
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
};

type LoadState = "loading" | "ready" | "error";

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Petit déjeuner",
  lunch: "Déjeuner",
  dinner: "Dîner",
  snack: "Collation",
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

function compactDayLabel(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return {
    weekday: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(value).replace(".", ""),
    day: new Intl.DateTimeFormat("fr-FR", { day: "numeric" }).format(value),
  };
}

function emptyData(date: string): MealJournalData {
  return { date, meals: { breakfast: null, lunch: null, snack: null, dinner: null } };
}

function emptyMeal(date: string, slot: MealSlot): MealRecord {
  return { id: randomId("meal"), date, slot, photos: [], note: "", analysis: null, mouthHeat: null, stomachLoad: null, status: "draft", error: null, confirmedAt: null };
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
  const hasPhotoEvidence = files.length > 0 || meal.photos.some((photo) => photo.storageStatus !== "purged");
  if (!hasPhotoEvidence) throw new Error("Ajoute au moins une photo du repas avant de lancer l’analyse.");
  const analysisRequestId = randomId("analysis");
  let mealId = meal.id;
  const isNewMeal = mealId.startsWith("meal-");
  if (isNewMeal) {
    const createResponse = await fetchMealWithTimeout("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": meal.id },
      body: JSON.stringify({ mealDate: date, mealType: slot, status: "draft", ...(meal.note.trim() ? { note: meal.note.trim().slice(0, 500) } : {}) }),
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
    await readJson(await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(mealId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: meal.note.trim().slice(0, 500) }) }, 15_000, { operation: "update", requestId: analysisRequestId }));
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
  const response = await fetchMeal(`/api/meals/${encodeURIComponent(mealId)}/analyze`, { method: "POST", headers: { "Content-Type": "application/json", "X-Analysis-Request-Id": analysisRequestId, "Idempotency-Key": analysisRequestId }, body: JSON.stringify({ force: Boolean(correction), idempotencyKey: analysisRequestId, ...(correction ? { correction } : {}) }) }, { operation: "analyze", requestId: analysisRequestId });
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
  if (meal.status === "confirmed") return "";
  if (meal.status === "analyzing") return "Analyse…";
  if (meal.status === "review") return "À relire";
  if (meal.status === "error") return "À réessayer";
  if (meal.photos.some((photo) => photo.storageStatus !== "purged")) return "Photos à analyser";
  if (meal.note.trim()) return "Texte à compléter";
  return "";
}

function visibleAnalysisError(message: string | null | undefined) {
  return message ?? "L’analyse n’a pas abouti. Vérifie ta connexion puis réessaie.";
}

function MealTextInput({ slot, meal, disabled, onNote }: { slot: MealSlot; meal: MealRecord | null; disabled: boolean; onNote: (note: string) => void }) {
  return <div className={styles.textInput}>
    <label className={styles.visuallyHidden} htmlFor={`meal-${slot}-note`}>Décrire : {SLOT_LABELS[slot]}</label>
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
  const secondary = accompaniments.length ? accompaniments.join(", ") : "—";
  const nutrition = [
    ["Calories", "kcal", analysis.calories, "calories"],
    ["Protéines", "g", analysis.proteinGrams, "protein"],
    ["Glucides", "g", analysis.carbohydratesGrams, "carbs"],
    ["Lipides", "g", analysis.fatGrams, "fat"],
    ["Sucres ajoutés", "g", analysis.addedSugarGrams, "sugar"],
  ] as const;
  return <div className={styles.labMealSummary} aria-label={`Résumé du ${SLOT_LABELS[meal.slot]}`}>
    <div className={styles.labMealDetails}>
      <div><span>Plat</span><strong>{main}</strong></div>
      <div><span>Accompagnement / dessert</span><strong>{secondary}</strong></div>
    </div>
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
      <textarea id={`meal-correction-${meal.id}`} rows={3} value={correctionText} maxLength={500} placeholder="Ex. Il y avait deux œufs, pas un, et une petite portion de riz." onChange={(event) => setCorrectionText(event.target.value)} />
      <div className={styles.reviewActions}>
        <button className={styles.analyzeButton} type="button" disabled={!correctionText.trim()} onClick={submitCorrection}>Réanalyser</button>
        <button className={styles.secondaryButton} type="button" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  </div>;
}

function MealCompletionControls({ status, saving, mutationBusy, onEdit, onConfirm }: {
  status: "review" | "confirmed";
  saving: boolean;
  mutationBusy: boolean;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  return <div className={styles.mealCompletionControls}>
    <div className={styles.reviewActions}>
      <button className={styles.secondaryButton} type="button" disabled={mutationBusy} onClick={onEdit}>Modifier</button>
      {status === "review" && <button className={styles.confirmButton} type="button" disabled={mutationBusy} onClick={onConfirm}>{saving ? <span className={styles.progressTrace} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}Confirmer</button>}
    </div>
  </div>;
}

function MealAnalysisDisclosure({ meal, status, showExplanation = false, correctionMode, ratingSaveState, onRating, onCorrection, onCancel }: {
  meal: MealRecord;
  status: "review" | "confirmed";
  showExplanation?: boolean;
  correctionMode: boolean;
  ratingSaveState: "idle" | "saving" | "saved" | "error";
  onRating: (key: "mouthHeat" | "stomachLoad", value: Rating | null) => void | Promise<boolean>;
  onCorrection: (correction: MealCorrection) => void;
  onCancel: () => void;
}) {
  return <details className={styles.analysisDetails} open={status === "review" || correctionMode}>
    <summary>Résultats de l’analyse</summary>
    <div className={styles.analysisDetailsBody}>
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
    </div>
  </details>;
}

function PhotoInput({ slot, onFiles, disabled = false, compact = false, single = false }: { slot: MealSlot; onFiles: (files: File[]) => void | Promise<void>; disabled?: boolean; compact?: boolean; single?: boolean }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const readFiles = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")));
    event.target.value = "";
  };
  return <div className={`${styles.photoInput} ${compact ? styles.photoInputCompact : ""} ${single ? styles.photoInputSingle : ""}`}>
    <input ref={cameraRef} className={styles.visuallyHidden} tabIndex={-1} aria-hidden="true" type="file" accept="image/*" capture="environment" aria-label={`Prendre une photo pour le ${SLOT_LABELS[slot]}`} disabled={disabled} onChange={readFiles} />
    <input ref={galleryRef} className={styles.visuallyHidden} tabIndex={-1} aria-hidden="true" type="file" accept="image/*" multiple aria-label={`Choisir des photos pour le ${SLOT_LABELS[slot]}`} disabled={disabled} onChange={readFiles} />
    {single && !choiceOpen ? <button className={styles.captureButtonCompact} type="button" disabled={disabled} aria-label="Ajouter une photo" aria-expanded={false} onClick={() => setChoiceOpen(true)}><Camera size={17} aria-hidden="true" />Photo</button> : <>
      <button className={compact ? styles.captureButtonCompact : styles.captureButton} type="button" disabled={disabled} onClick={() => cameraRef.current?.click()}><Camera size={17} aria-hidden="true" />{compact ? "Caméra" : "Prendre une photo"}</button>
      <button className={compact ? styles.galleryButtonCompact : styles.galleryButton} type="button" disabled={disabled} onClick={() => galleryRef.current?.click()}><ImagePlus size={17} aria-hidden="true" />{compact ? "Photos" : "Choisir dans Photos"}</button>
    </>}
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

/**
 * Confirmed meals keep their original evidence available without reopening
 * the editable capture form. This is intentionally read-only: the existing
 * "Modifier" action remains the single way to change a note or photo.
 */
function MealSourceEvidence({ meal }: { meal: MealRecord }) {
  const photos = meal.photos.filter((photo) => photo.storageStatus !== "purged");
  const note = meal.note.trim();
  if (!photos.length && !note) return null;
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
      {note && <p className={styles.sourceNote}><span>Note du jour</span>{note}</p>}
    </div>
  </details>;
}

function MealCard({ meal, slot, saving, processingFiles, mutationBusy, disabled = false, compactEmpty = false, labCompact = false, mealsCompact = false, openRequest, onFiles, onRemovePhoto, onOrigin, onAnalyze, onConfirm, onRating, onRetry, onNote, onCorrection, confirmError }: {
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
  onConfirm: () => void;
  onRating: (key: "mouthHeat" | "stomachLoad", value: Rating | null) => void | Promise<boolean>;
  onRetry: () => void;
  onNote: (note: string) => void;
  onCorrection: (correction: MealCorrection) => void;
  confirmError?: string | null;
}) {
  const [correctionMode, setCorrectionMode] = useState(false);
  const [ratingSaveState, setRatingSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [entryStarted, setEntryStarted] = useState(false);
  const headingId = `meal-${slot}-title`;
  const hasPhotos = Boolean(meal && meal.photos.some((photo) => photo.storageStatus !== "purged"));
  const status = meal?.status ?? "draft";
  const canAnalyze = Boolean(meal) && hasPhotos && status === "draft";
  const skipped = disabled && !meal;
  const visibleStatus = meal ? statusLabel(meal) : skipped ? "Ignoré" : "";
  const entryOpen = !compactEmpty || Boolean(meal) || entryStarted || Boolean(openRequest);
  const compactEmptyState = compactEmpty && !meal && !skipped && !entryOpen;
  const integratedEmpty = mealsCompact || labCompact;

  useEffect(() => {
    if (!openRequest || skipped) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`meal-${slot}-note`)?.focus({ preventScroll: true });
      document.getElementById(`meal-${slot}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [openRequest, skipped, slot]);

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
      <div className={styles.mealTitle}><h3 id={headingId}>{SLOT_LABELS[slot]}</h3></div>
      {mealsCompact ? <div className={styles.mealHeaderMeta}>
        {meal?.analysis && <span className={styles.mealCalories}>{likelyLabel(meal.analysis.calories)} kcal</span>}
        {visibleStatus && <span className={styles.mealStatus} data-status={meal?.status ?? "empty"}>{meal?.status === "confirmed" ? <Check size={14} aria-hidden="true" /> : null}{visibleStatus}</span>}
      </div> : visibleStatus && <span className={styles.mealStatus} data-status={meal?.status ?? "empty"}>{meal?.status === "confirmed" ? <Check size={14} aria-hidden="true" /> : null}{visibleStatus}</span>}
    </header>
    {skipped && <div className={styles.skippedState} role="status">Créneau ignoré dans le journal.</div>}
    {compactEmptyState && <div className={styles.emptyMealPrompt} role="group" aria-label={`${SLOT_LABELS[slot]} non renseigné`}>
      {integratedEmpty ? <MealTextInput slot={slot} meal={meal} disabled={processingFiles || mutationBusy || disabled} onNote={onNote} /> : null}
      <div className={styles.emptyMealActions}>
        {integratedEmpty ? <PhotoInput slot={slot} onFiles={handleFiles} disabled={processingFiles || disabled} compact single /> : <><button className={styles.emptyNoteButton} type="button" onClick={() => setEntryStarted(true)}>Écrire</button><PhotoInput slot={slot} onFiles={handleFiles} disabled={processingFiles || disabled} compact /></>}
      </div>
    </div>}
    {!skipped && status === "analyzing" && <div className={styles.analyzingState} role="status" aria-live="polite"><span className={styles.progressTrace} aria-hidden="true" /><strong>Analyse en cours</strong></div>}
    {!skipped && !compactEmptyState && status !== "analyzing" && <div className={`${styles.mealBody} ${status === "draft" ? styles.draftMeal : ""}`}>
      {hasPhotos && status !== "confirmed" && <PhotoStrip meal={meal as MealRecord} onRemove={onRemovePhoto} onOrigin={onOrigin} disabled={mutationBusy || disabled} />}
      {status !== "confirmed" && <MealTextInput slot={slot} meal={meal} disabled={processingFiles || mutationBusy || disabled} onNote={onNote} />}
      {status === "draft" && <div className={styles.actionsRow}>
        <PhotoInput slot={slot} onFiles={handleFiles} disabled={processingFiles || disabled} />
        <button className={styles.analyzeButton} type="button" disabled={!canAnalyze || processingFiles || mutationBusy || disabled} onClick={onAnalyze}>
          <Sparkles size={17} aria-hidden="true" />Analyser
        </button>
        {!hasPhotos && <p className={styles.photoRequired}>Ajoute une photo pour lancer l’analyse. La note est optionnelle.</p>}
      </div>}
      {status === "error" && <div className={styles.errorState} role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Analyse interrompue</strong><span>{visibleAnalysisError(meal?.error)}</span></div><button className={styles.retryButton} type="button" disabled={mutationBusy} onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Réessayer</button></div>}
      {status === "confirmed" && meal && <MealSourceEvidence meal={meal} />}
      {(status === "review" || status === "confirmed") && meal?.analysis && <>{mealsCompact ? <MealsMealSummary meal={meal} /> : labCompact ? <LabMealSummary meal={meal} /> : <AnalysisSummary meal={meal} />}<MealAnalysisDisclosure meal={meal} status={status} showExplanation={labCompact} correctionMode={correctionMode} ratingSaveState={ratingSaveState} onRating={handleRating} onCorrection={(correction) => { setCorrectionMode(false); onCorrection(correction); }} onCancel={() => setCorrectionMode(false)} />{confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}<MealCompletionControls status={status} saving={saving} mutationBusy={mutationBusy} onEdit={() => setCorrectionMode(true)} onConfirm={onConfirm} /></>}
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

function MealLabHeader({ onAddMeal, addDisabled }: { onAddMeal: () => void; addDisabled: boolean }) {
  return <header className={styles.labHeader}>
    <h2 id="meal-journal-title">Repas</h2>
    <button type="button" aria-label="Ajouter un repas" title="Ajouter un repas" disabled={addDisabled} onClick={onAddMeal}><Plus size={17} aria-hidden="true" /></button>
  </header>;
}

export function MealJournal({ date, today: providedToday, initialData, api, className, disabledSlots = [], selectedDate: selectedDateProp, onDateChange, showDateNavigation = true, sharedDateNavigation, children, historyDays, variant = "page", publishMealTotals = false }: Props) {
  const today = providedToday ?? todayInLocalTime();
  const requestedDate = date ?? initialData?.date ?? today;
  const initialDate = requestedDate > today ? today : requestedDate;
  const [internalSelectedDate, setInternalSelectedDate] = useState(initialDate);
  const selectedDate = selectedDateProp ?? internalSelectedDate;
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
  const [entryRequest, setEntryRequest] = useState<{ slot: MealSlot; sequence: number } | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const objectUrls = useRef(new Set<string>());
  const targetSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRequestId = useRef(0);
  const mutationInFlight = useRef(false);
  const ratingSaveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const ratingValues = useRef<Partial<Record<string, { mouthHeat: Rating | null; stomachLoad: Rating | null }>>>({});
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
    setEntryRequest(null);
    setLoadState("loading");
    if (selectedDateProp === undefined) setInternalSelectedDate(nextDate);
    onDateChange?.(nextDate);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextDate === today) url.searchParams.delete("date");
      else url.searchParams.set("date", nextDate);
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      if (variant === "meals" && !onDateChange) {
        window.location.replace(nextUrl);
        return;
      }
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [navigationDisabled, onDateChange, selectedDate, selectedDateProp, today, variant]);

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

  const controlledDate = useRef(selectedDateProp);
  useEffect(() => {
    if (selectedDateProp === undefined || controlledDate.current === selectedDateProp) return;
    controlledDate.current = selectedDateProp;
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    setFilesByPhotoId({});
    setFileError(null);
    setConfirmError({});
    setData(null);
    setLoadState("loading");
    setLoadError(null);
  }, [selectedDateProp]);

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

  const currentDayTotal = data?.date === selectedDate ? sumLikelyDay(data.meals) : null;
  const emitMealTotals = useCallback(() => {
    if (!publishMealTotals || typeof window === "undefined") return;
    const calorieTarget = targets.caloriesKcal.likely > 0 ? targets.caloriesKcal.likely : null;
    const calories = currentDayTotal?.calories ?? null;
    const calorieProgress = calorieProgressForDisplay(calories, calorieTarget ?? 0);
    window.dispatchEvent(new CustomEvent(MEAL_TOTALS_EVENT, {
      detail: { date: selectedDate, isToday: selectedDate === today, calories, calorieTarget, calorieProgress },
    }));
  }, [currentDayTotal?.calories, publishMealTotals, selectedDate, targets.caloriesKcal.likely, today]);

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
    const prepared: File[] = [];
    try {
      for (const file of incoming) prepared.push(await normalizeMealImage(file));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Cette photo n’a pas pu être préparée. Prends-la à nouveau en JPEG ou PNG.");
      setProcessingFiles(false);
      mutationInFlight.current = false;
      return;
    }
    const currentMeal = data?.meals[slot] ?? emptyMeal(selectedDate, slot);
    const activePhotoCount = currentMeal.photos.filter((photo) => photo.storageStatus !== "purged").length;
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
    updateMeal(slot, (current) => ({ ...current, note: note.slice(0, 500), status: "draft", error: null }));
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

  const saveMeal = async (meal: MealRecord, status: MealStatus = "confirmed", options: { queued?: boolean } = {}): Promise<boolean> => {
    if (!options.queued && mutationInFlight.current) return false;
    mutationInFlight.current = true;
    setSavingSlot(meal.slot);
    setConfirmError((previous) => ({ ...previous, [meal.slot]: null }));
    try {
      const saved = await (api?.save ? api.save({ ...meal, status }) : defaultSave({ ...meal, status }));
      const nextMeal = normalizeMeal({ ...meal, ...saved, note: typeof saved.note === "string" ? saved.note : meal.note, status }, selectedDate, meal.slot);
      setData((current) => current ? { ...current, meals: { ...current.meals, [meal.slot]: nextMeal } } : current);
      return true;
    } catch (error) {
      setConfirmError((previous) => ({ ...previous, [meal.slot]: error instanceof Error ? error.message : "Le repas n’a pas pu être enregistré." }));
      updateMeal(meal.slot, (current) => ({ ...current, status: current.analysis ? "review" : "draft", error: error instanceof Error ? error.message : "Le repas n’a pas pu être enregistré." }));
      return false;
    } finally {
      mutationInFlight.current = false;
      setSavingSlot(null);
    }
  };

  const analyzeMeal = async (slot: MealSlot, correction?: MealCorrection) => {
    const meal = data?.meals[slot];
    if (!meal || mutationInFlight.current) return;
    const activePhotos = meal.photos.filter((photo) => photo.storageStatus !== "purged");
    const hasPhotosForAnalyze = activePhotos.length > 0;
    if (correction) {
      // Grok receives the correction together with the current evidence and
      // recalculates the complete analysis in one request.
    } else if (hasPhotosForAnalyze) {
      if (activePhotos.length > MAX_MEAL_PHOTOS) {
        setFileError(`Ce repas contient ${activePhotos.length} photos, mais ${MAX_MEAL_PHOTOS} au maximum sont autorisées. Retire-en avant de relancer l’analyse.`);
        return;
      }
    } else if (!hasPhotosForAnalyze) {
      setFileError("Ajoute au moins une photo du repas avant de lancer l’analyse.");
      return;
    }
    mutationInFlight.current = true;
    updateMeal(slot, (current) => ({ ...current, status: "analyzing", error: null }));
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
      updateMeal(slot, (current) => ({ ...current, ...normalizeMeal({ ...analyzed, note: typeof analyzed.note === "string" && analyzed.note ? analyzed.note : current.note, photos: analyzed.photos?.length ? analyzed.photos : current.photos, status: "review", error: null }, selectedDate, slot), status: "review" }));
    } catch (error) {
      updateMeal(slot, (current) => ({ ...current, status: current.analysis ? "review" : "error", error: error instanceof Error ? error.message : "L’analyse n’a pas pu aboutir." }));
    } finally {
      mutationInFlight.current = false;
    }
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

  const handleConfirm = (slot: MealSlot, meal: MealRecord) => {
    if (!meal.analysis) {
      setConfirmError((previous) => ({ ...previous, [slot]: "Ajoute une photo et analyse le repas avant de le valider." }));
      return;
    }
    // Ressentis optionnels : ne plus bloquer la validation
    setConfirmError((previous) => ({ ...previous, [slot]: null }));
    void saveMeal(meal);
  };

  const historyDates = mealHistoryDates(selectedDate, today, variant === "meals" ? historyDays ?? 6 : historyDays ?? 7);
  const visibleHistoryDates = variant === "meals" ? [...historyDates].reverse() : historyDates;
  const internalDateNavigation = showDateNavigation ? <nav className={styles.historyNavigation} aria-label="Historique des repas">
    {variant === "meals" && <button className={styles.historyArrow} type="button" disabled={navigationDisabled} aria-label="Jours précédents" onClick={() => selectDate(shiftIsoDate(selectedDate, -1))}>‹</button>}
    <div className={`${styles.weekStrip} ${variant === "meals" ? styles.mealsWeekStrip : ""}`} role="group" aria-label={variant === "meals" ? "Six jours" : "Sept jours"}>
      {visibleHistoryDates.map((historyDate) => {
        const label = compactDayLabel(historyDate);
        return <button key={historyDate} type="button" disabled={navigationDisabled} className={historyDate === selectedDate ? styles.weekDaySelected : styles.weekDay} aria-pressed={historyDate === selectedDate} aria-current={historyDate === selectedDate ? "date" : undefined} aria-label={formatDate(historyDate)} onClick={() => selectDate(historyDate)}><span>{label.weekday}</span><strong>{label.day}</strong></button>;
      })}
    </div>
    {variant === "meals" && <button className={styles.historyArrow} type="button" disabled={navigationDisabled || selectedDate >= today} aria-label="Jours suivants" onClick={() => selectDate(shiftIsoDate(selectedDate, 1))}>›</button>}
  </nav> : null;
  const dateNavigation = sharedDateNavigation ?? internalDateNavigation;
  const availableMealSlot = data ? firstAvailableMealSlot(data.meals, disabledSlots) : null;
  const openAvailableMeal = () => {
    if (!availableMealSlot || navigationDisabled) return;
    setEntryRequest((current) => ({ slot: availableMealSlot, sequence: (current?.sequence ?? 0) + 1 }));
  };
  const pageHeader = variant === "home" ? <MealHomeHeader /> : variant === "lab" ? <MealLabHeader onAddMeal={openAvailableMeal} addDisabled={!availableMealSlot || navigationDisabled} /> : <MealPageHeader totals={currentDayTotal} targets={targets} mealsVariant={variant === "meals"} targetsExpanded={targetsExpanded} onToggleTargets={variant === "meals" ? () => setTargetsExpanded((expanded) => !expanded) : undefined} />;
  const rootClass = [styles.root, className, variant === "lab" ? styles.labRoot : "", variant === "meals" ? styles.mealsPageRoot : ""].filter(Boolean).join(" ");

  if (loadState === "loading") return <section className={rootClass} aria-labelledby="meal-journal-title">{pageHeader}{dateNavigation}<div className={styles.loadingState} role="status" aria-live="polite"><span className={styles.progressTrace} aria-hidden="true" /><span>Chargement des repas…</span></div></section>;
  if (loadState === "error") return <section className={rootClass} aria-labelledby="meal-journal-title">{pageHeader}{dateNavigation}<div className={styles.errorState} role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Impossible de charger les repas</strong><span>{loadError}</span></div><button className={styles.retryButton} type="button" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" />Réessayer</button></div></section>;

  const readyData = data ?? emptyData(selectedDate);
  return <section className={rootClass} aria-labelledby="meal-journal-title">
    {pageHeader}
    {dateNavigation}
    {variant !== "lab" && variant !== "meals" && <div className={styles.targetControls}>
      <button className={styles.targetEditButton} type="button" aria-label="Modifier les cibles du jour" aria-expanded={targetsExpanded} aria-controls="meal-target-editor" onClick={() => setTargetsExpanded((expanded) => !expanded)}><Pencil size={16} aria-hidden="true" /></button>
    </div>}
    {variant !== "lab" && targetsExpanded && <div id="meal-target-editor" className={styles.targetEditor}>
      <label><span>Calories (kcal)</span><input type="number" min="0" inputMode="numeric" aria-label="Cible calories, valeur estimée" value={targets.caloriesKcal.likely} onChange={(event) => updateTargetLikely("caloriesKcal", event.target.value)} /></label>
      <label><span>Protéines (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible protéines, valeur estimée" value={targets.proteinG.likely} onChange={(event) => updateTargetLikely("proteinG", event.target.value)} /></label>
      <label><span>Lipides (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible lipides, valeur estimée" value={targets.fatG.likely} onChange={(event) => updateTargetLikely("fatG", event.target.value)} /></label>
      <label><span>Glucides (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible glucides, valeur estimée" value={targets.carbsG.likely} onChange={(event) => updateTargetLikely("carbsG", event.target.value)} /></label>
      <label><span>Fibres (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Cible fibres, valeur estimée" value={targets.fiberG.likely} onChange={(event) => updateTargetLikely("fiberG", event.target.value)} /></label>
    </div>}
    {variant !== "lab" && targetError && <p className={styles.confirmError} role="status">{targetError}</p>}
    {fileError && <div className={styles.fileError} role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{fileError}</span><button className={styles.dismissError} type="button" onClick={() => setFileError(null)} aria-label="Fermer le message photo"><X size={16} aria-hidden="true" /></button></div>}
    {variant === "meals" ? <div className={styles.mealsWorkbench}>
      <section className={styles.mealsJournalPanel} aria-labelledby="meals-journal-panel-title">
        <header className={styles.mealsJournalHeader}>
          <h2 id="meals-journal-panel-title">Journal des repas</h2>
          <button type="button" aria-label="Ajouter un repas" title="Ajouter un repas" disabled={!availableMealSlot || navigationDisabled} onClick={openAvailableMeal}><Plus size={17} aria-hidden="true" /></button>
        </header>
        <div className={styles.mealList}>{MEAL_SLOTS.map((slot) => {
      const meal = readyData.meals[slot] ?? null;
          return <div id={`meal-${slot}`} key={`${selectedDate}-${slot}`}><MealCard meal={meal} slot={slot} compactEmpty mealsCompact openRequest={entryRequest?.slot === slot ? entryRequest.sequence : undefined} disabled={disabledSlots.includes(slot)} saving={savingSlot === slot} processingFiles={processingFiles} mutationBusy={navigationDisabled} confirmError={confirmError[slot]} onFiles={(files) => addFiles(slot, files)} onRemovePhoto={(photoId) => void removePhoto(slot, photoId)} onOrigin={(photoId, origin) => void setPhotoOrigin(slot, photoId, origin)} onAnalyze={() => void analyzeMeal(slot)} onCorrection={(correction) => void analyzeMeal(slot, correction)} onConfirm={() => { if (meal) handleConfirm(slot, meal); }} onRating={(key, value) => setRating(slot, key, value)} onRetry={() => void analyzeMeal(slot)} onNote={(note) => setNote(slot, note)} /></div>;
        })}</div>
      </section>
      <div className={styles.mealsSecondary}>{children}</div>
    </div> : <div className={styles.mealList}>{MEAL_SLOTS.map((slot) => {
        const meal = readyData.meals[slot] ?? null;
        return <div id={`meal-${slot}`} key={`${selectedDate}-${slot}`}><MealCard meal={meal} slot={slot} compactEmpty={variant !== "page"} labCompact={variant === "lab"} openRequest={entryRequest?.slot === slot ? entryRequest.sequence : undefined} disabled={disabledSlots.includes(slot)} saving={savingSlot === slot} processingFiles={processingFiles} mutationBusy={navigationDisabled} confirmError={confirmError[slot]} onFiles={(files) => addFiles(slot, files)} onRemovePhoto={(photoId) => void removePhoto(slot, photoId)} onOrigin={(photoId, origin) => void setPhotoOrigin(slot, photoId, origin)} onAnalyze={() => void analyzeMeal(slot)} onCorrection={(correction) => void analyzeMeal(slot, correction)} onConfirm={() => { if (meal) handleConfirm(slot, meal); }} onRating={(key, value) => setRating(slot, key, value)} onRetry={() => void analyzeMeal(slot)} onNote={(note) => setNote(slot, note)} /></div>;
      })}</div>}
  </section>;
}

export default MealJournal;
