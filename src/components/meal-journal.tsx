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
  MEAL_TARGET_SLOTS,
  mergeDailyNutritionTargets,
  mealTargetDistributionOf,
  nutritionTargetsForEffort,
  loadNutritionTargets,
  parseNutritionTargets,
  saveNutritionTargets,
  type EffortTargetContext,
  type MealTargetSlot,
  type NutritionTargets,
} from "@/domain/nutrition-targets";
import {
  classifyMealClientError,
  fetchMealWithTimeout,
  MEAL_ANALYSIS_REQUEST_TIMEOUT_MS,
  MEAL_ANALYSIS_STATUS_TIMEOUT_MS,
  visibleAnalysisError,
} from "@/services/meal-client";
import { normalizeMealImage } from "@/services/meal-image";
import { LabMealCard, type MealDesignVariant } from "@/components/lab/meal-card-variants";
import styles from "./meal-journal.module.css";

export { apiMealToRecord, MEAL_SLOTS, visibleAnalysisError };
export type { MealEntryState } from "@/domain/meals";
export type MealAnalysisProgress = {
  phase?: string;
  dishType?: string;
  foods: string[];
};
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
  starter: "Starter",
  main: "Main course",
  side: "Side",
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
  readOnly?: boolean;
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
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export function mealSlotForLocalTime(value: Date = new Date()): MealSlot | null {
  const hour = value.getHours();
  if (hour >= 6 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour === 16) return "snack";
  if (hour >= 17 && hour < 24) return "dinner";
  return null;
}

function localDateFor(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function nextMealPriorityBoundary(value: Date) {
  const next = new Date(value);
  const hour = value.getHours();
  if (hour < 6) next.setHours(6, 0, 0, 0);
  else if (hour < 11) next.setHours(11, 0, 0, 0);
  else if (hour < 16) next.setHours(16, 0, 0, 0);
  else if (hour < 17) next.setHours(17, 0, 0, 0);
  else {
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  }
  return next;
}

function mealLabelWithArticle(slot: MealSlot) {
  return SLOT_LABELS[slot].toLowerCase();
}

const ORIGIN_LABELS: Record<MealOrigin, string> = {
  homemade: "Homemade",
  prepared: "Prepared / store-bought",
  mixed: "Mixed",
};

const RATING_LABELS = {
  mouthHeat: "Mouth heat",
  stomachLoad: "Stomach heaviness",
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
    hasNutritionValue(ingredient.proteinGrams) ? `${likelyLabel(ingredient.proteinGrams)} g protein` : null,
    hasNutritionValue(ingredient.carbohydratesGrams) ? `${likelyLabel(ingredient.carbohydratesGrams)} g carbs` : null,
    hasNutritionValue(ingredient.fatGrams) ? `${likelyLabel(ingredient.fatGrams)} g fat` : null,
    hasNutritionValue(ingredient.fiberGrams) ? `${likelyLabel(ingredient.fiberGrams)} g fiber` : null,
    hasNutritionValue(ingredient.sugarGrams) ? `${likelyLabel(ingredient.sugarGrams)} g sugar` : null,
    hasNutritionValue(ingredient.addedSugarGrams) ? `${likelyLabel(ingredient.addedSugarGrams)} g added sugar` : null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function normalizedDisplayText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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
  if (roots.length === 0) return <p className={styles.ingredientsList}>No detailed breakdown</p>;
  const sections = groupIngredientSections(roots);
  const dishType = analysis.dishType?.trim();
  const hasDishRoot = Boolean(dishType && roots.some((node) => node.ingredient.kind === "dish" && (normalizedDisplayText(dishType).includes(normalizedDisplayText(node.ingredient.name)) || normalizedDisplayText(node.ingredient.name).includes(normalizedDisplayText(dishType)))));
  return <div className={styles.ingredientGroups} aria-label="Meal composition">
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
    ? "Today"
    : relativeDays === 1
      ? "Yesterday"
      : relativeDays === 2
        ? "2 days ago"
        : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(value);
  return {
    weekday,
    day: new Intl.DateTimeFormat("en-US", today ? { month: "short", day: "numeric" } : { day: "numeric" }).format(value),
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
 * keeps the client message clear even when the API is not reached.
 */
export function mealPhotoLimitMessage(activePhotoCount: number, incomingPhotoCount: number, maxPhotos = MAX_MEAL_PHOTOS) {
  const available = Math.max(0, maxPhotos - Math.max(0, activePhotoCount));
  const rejected = Math.max(0, incomingPhotoCount - available);
  if (rejected === 0) return null;
  if (available === 0) return `Maximum limit of ${maxPhotos} photos per meal reached. Remove a photo before adding another.`;
  const subject = `${rejected} photo${rejected > 1 ? "s" : ""}`;
  return `Maximum ${maxPhotos} photos per meal. ${subject} ${rejected > 1 ? "were not added" : "was not added"}.`;
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
    const error = new Error(typeof body?.error === "string" ? body.error : "Meals are currently unavailable.");
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
  onMealCreated?: (mealId: string) => void;
  onPhotosUploaded?: (photos: UploadedPhotoPair[]) => void;
  onProgress?: (progress: MealAnalysisProgress) => void;
};

export async function defaultAnalyze({ date, slot, meal, files, photoFiles, correction }: AnalyzeMealInput, options: DefaultAnalyzeOptions = {}) {
  const hasPhotoEvidence = files.length > 0 || (meal.status !== "confirmed" && meal.photos.some((photo) => (photo.storageStatus ?? "available") === "available"));
  const hasTextEvidence = Boolean(meal.note.trim());
  const hasCorrection = Boolean(correction?.trim());
  if (!hasPhotoEvidence && !hasTextEvidence && !hasCorrection) throw new Error("Add a photo or a description of the meal before starting analysis.");
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
    options.onMealCreated?.(mealId);
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
    await Promise.all(meal.photos.filter((photo) => !photo.id.startsWith("photo-") && photo.comment != null).map(async (photo) =>
      readJson(await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(mealId)}/photos/${encodeURIComponent(photo.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: photo.comment }) }, 15_000, { operation: "update", requestId: analysisRequestId })),
    ));
  }
  if (files.length > 0) {
    const uploadFiles = uploadEntries.map((entry) => entry.file);
    const origins = uploadEntries.map((entry) => entry.photo.origin ?? "unknown");
    if (uploadFiles.length !== files.length) throw new Error("Selected photos no longer match the meal.");
    for (const [index, entry] of uploadEntries.entries()) {
      const file = uploadFiles[index];
      if (file.size > 4 * 1024 * 1024) throw new Error("Cette photo est trop lourde pour l’envoi. Choisis une photo plus légère.");
      const form = new FormData();
      form.set("origin", origins[index]);
      form.set("comment_0", entry.photo.comment ?? "");
      form.append("photos", file, file.name);
      const uploadKey = `meal-${mealId}-photo-${entry.photo.id}`;
      const uploadedBody = await readJson(await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(mealId)}/photos`, { method: "POST", headers: { "Idempotency-Key": uploadKey }, body: form }, 60_000, { operation: "upload", requestId: analysisRequestId })) as { photos?: MealPhoto[] };
      if (!Array.isArray(uploadedBody.photos) || uploadedBody.photos.length !== 1) throw new Error("The server did not confirm the photo for the meal.");
      options.onPhotosUploaded?.([{ localPhotoId: entry.photo.id, photo: uploadedBody.photos[0] }]);
    }
  }
  const response = await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(mealId)}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Analysis-Request-Id": analysisRequestId,
      "Idempotency-Key": analysisRequestId
    },
    body: JSON.stringify({
      stream: false,
      force: Boolean(correction || meal.analysis),
      idempotencyKey: analysisRequestId,
      ...(correction ? { correction } : {})
    })
  }, MEAL_ANALYSIS_REQUEST_TIMEOUT_MS, { operation: "analyze", requestId: analysisRequestId });

  if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let currentProgress: MealAnalysisProgress = { phase: "Connexion…", foods: [] as string[], dishType: undefined };
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === "phase") {
                const phasesMap: Record<string, string> = {
                  "starting": "Préparation des photos…",
                  "downloading_photos": "Préparation des photos…",
                  "reasoning": "Réflexion nutritionnelle…",
                  "analyzing": "Analyse du repas…",
                  "validating": "Validation des données…",
                  "finalizing": "Enregistrement…"
                };
                currentProgress = { ...currentProgress, phase: phasesMap[data.phase] || "Analyse en cours…" };
                options.onProgress?.(currentProgress);
              } else if (currentEvent === "dish_detected") {
                currentProgress = { ...currentProgress, dishType: data.dishType, phase: `Plat : ${data.dishType}` };
                options.onProgress?.(currentProgress);
              } else if (currentEvent === "food_detected") {
                if (!currentProgress.foods.includes(data.food)) {
                  currentProgress = { ...currentProgress, phase: "Identification des aliments…", foods: [...currentProgress.foods, data.food] };
                  options.onProgress?.(currentProgress);
                }
              } else if (currentEvent === "complete") {
                return apiMealToRecord(data.meal);
              } else if (currentEvent === "error") {
                throw new Error(data.error || "L’analyse a échoué.");
              }
            } catch (e) {
              if (currentEvent === "error") throw e;
            }
          }
        }
      }
    } catch (readError) {
      // If the stream is interrupted (network glitch, client timeout, or disconnect),
      // verify if the server completed the analysis in the background before failing.
      try {
        const statusRes = await fetchMealWithTimeout(
          `/api/meals/${encodeURIComponent(mealId)}/analyze`,
          { cache: "no-store" },
          5_000,
          { operation: "load" }
        );
        const statusBody = await readJson(statusRes) as { meal?: unknown };
        if (statusBody?.meal) {
          return apiMealToRecord(statusBody.meal);
        }
      } catch {
        // Fall through to throw classified error
      }
      throw classifyMealClientError(readError, "analyze", analysisRequestId);
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Reader may already be released
      }
    }
  }

  const body = await readJson(response);
  if (!body || typeof body.meal !== "object" || body.meal === null) throw new Error("The server did not return the analyzed meal.");
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
    if (!body.meal || typeof body.meal !== "object") throw new Error("The slot status could not be saved.");
    const saved = apiMealToRecord(body.meal);
    return { ...saved, note: meal.note, photos: meal.photos, analysis: meal.analysis };
  }
  const response = await fetch(`/api/meals/${encodeURIComponent(meal.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryState }),
  });
  const body = await readJson(response) as { meal?: unknown };
  if (!body.meal || typeof body.meal !== "object") throw new Error("The slot status could not be saved.");
  return apiMealToRecord(body.meal);
}

async function defaultRemovePhoto(mealId: string, photoId: string) {
  await readJson(await fetch(`/api/meals/${encodeURIComponent(mealId)}/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" }));
}

export async function defaultRemoveMeal(mealId: string) {
  await readJson(await fetch(`/api/meals/${encodeURIComponent(mealId)}`, { method: "DELETE" }));
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
    summary: "Analysis reviewed and confirmed.",
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
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00`));
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
  const confirmed = MEAL_SLOTS.map((slot) => meals[slot]).filter((meal): meal is MealRecord => meal !== null && meal !== undefined && meal.status === "confirmed" && meal.entryState !== "skipped");
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
  if (meal.entryState === "skipped") return "Skipped";
  if (meal.status === "error" || meal.error) return "Needs retry";
  if (meal.status === "confirmed") return "Confirmed";
  // Older API responses used `review` after analysis. The new flow confirms
  // successful analyses automatically, so keep that legacy response from
  // exposing a second review step while the backend rolls forward.
  if (meal.status === "review" && meal.analysis && !meal.error) return "Finalisation…";
  if (meal.status === "accepted") return "Analysis queued";
  if (meal.status === "analyzing") return "Analyzing…";
  if (meal.status === "review") return "Ready for review";
  const hasPhotos = meal.photos.some((photo) => (photo.storageStatus ?? "available") === "available");
  const hasText = Boolean(meal.note.trim());
  if (hasPhotos && hasText) return "Ready to analyze";
  if (hasPhotos) return "Photos to analyze";
  if (hasText) return "Note to analyze";
  return "Draft";
}

export const MEAL_NOTE_MAX_LENGTH = 500;

function MealNoteCounter({ id, length, maxLength = MEAL_NOTE_MAX_LENGTH }: { id: string; length: number; maxLength?: number }) {
  const remaining = Math.max(0, maxLength - length);
  return <p id={id} className={styles.noteCounter} aria-live="polite">{length}/{maxLength} · {remaining} remaining</p>;
}

function MealTextInput({ slot, meal, disabled, placeholder = "e.g. 2 bananas and a black coffee.", onNote, onAnalyze }: { slot: MealSlot; meal: MealRecord | null; disabled: boolean; placeholder?: string; onNote: (note: string) => void; onAnalyze?: () => void }) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onAnalyze?.();
    }
  };
  const counterId = `meal-${slot}-note-count`;
  return <div className={styles.textInput}>
    <label className={styles.visuallyHidden} htmlFor={`meal-${slot}-note`}>Describe: {SLOT_LABELS[slot]}</label>
    <textarea id={`meal-${slot}-note`} rows={3} value={meal?.note ?? ""} maxLength={MEAL_NOTE_MAX_LENGTH} placeholder={placeholder} disabled={disabled} onChange={(event) => onNote(event.target.value)} onKeyDown={handleKeyDown} aria-describedby={counterId} />
    <MealNoteCounter id={counterId} length={meal?.note.length ?? 0} />
  </div>;
}

function PhotoOriginPicker({ photo, onChange }: { photo: MealPhoto; onChange: (origin: MealOrigin) => void }) {
  const hintId = `meal-photo-origin-hint-${photo.id}`;
  return <fieldset className={styles.originFieldset} aria-describedby={hintId}>
    <legend>Photo origin</legend>
    <p id={hintId} className={styles.originHint}>Origin helps analysis: homemade dishes are assessed differently from store-bought items.</p>
    <div className={styles.originChoices}>
      {(Object.keys(ORIGIN_LABELS) as MealOrigin[]).map((origin) => <button className={photo.origin === origin ? styles.originChoiceSelected : styles.originChoice} type="button" key={origin} aria-pressed={photo.origin === origin} onClick={() => onChange(origin)}>{ORIGIN_LABELS[origin]}</button>)}
    </div>
  </fieldset>;
}

function RatingScale({ label, value, onChange }: { label: string; value: Rating | null; onChange: (next: Rating) => void }) {
  return <fieldset className={styles.ratingFieldset}>
    <legend>{label}</legend>
    <div className={styles.ratingScale}>
      <button className={value === 0 ? styles.ratingSelected : styles.ratingChoice} type="button" aria-pressed={value === 0} onClick={() => onChange(0)}>None</button>
      {[1, 2, 3, 4, 5].map((rating) => <button className={value === rating ? styles.ratingSelected : styles.ratingChoice} type="button" aria-pressed={value === rating} onClick={() => onChange(rating as Rating)} key={rating}>{rating}</button>)}
    </div>
  </fieldset>;
}

function AnalysisDisplay({ meal }: { meal: MealRecord }) {
  const analysis = meal.analysis;
  if (!analysis) return null;
  const sugarRange = analysis.sugarGrams ?? analysis.addedSugarGrams;
  const sugarLabel = analysis.sugarGrams ? "Sugar" : analysis.addedSugarGrams ? "Added sugar" : null;
  const nutritionMetrics = [
    { label: "Calories", unit: "kcal", range: analysis.calories, metric: "calories" },
    { label: "Protein", unit: "g", range: analysis.proteinGrams, metric: "protein" },
    { label: "Fat", unit: "g", range: analysis.fatGrams, metric: "fat" },
    { label: "Carbohydrates", unit: "g", range: analysis.carbohydratesGrams, metric: "carbs" },
    { label: "Fiber", unit: "g", range: analysis.fiberGrams, metric: "fiber" },
    ...(sugarRange && sugarLabel ? [{ label: sugarLabel, unit: "g", range: sugarRange, metric: "sugar" }] : []),
  ];
  return <div className={styles.analysisDisplay}>
    <div className={styles.confirmedNutrition}>
      {nutritionMetrics.map(({ label, unit, range, metric }) => <span data-metric={metric} key={label} aria-label={`${label}: ${likelyLabel(range)} ${unit}, estimated range ${formatLowHigh(range)}`} title={`Estimated range ${formatLowHigh(range)} ${unit}`}><small>{label}</small><strong>{likelyLabel(range)} <small>{unit}</small></strong></span>)}
    </div>
    <IngredientGroups analysis={analysis} />
  </div>;
}

function AnalysisSummary({ meal }: { meal: MealRecord }) {
  const analysis = meal.analysis;
  if (!analysis) return null;
  const metrics = [
    { label: "Calories", unit: "kcal", range: analysis.calories, metric: "calories" },
    { label: "Protein", unit: "g", range: analysis.proteinGrams, metric: "protein" },
    { label: "Added sugar", unit: "g", range: analysis.addedSugarGrams, metric: "sugar" },
  ];
  return <div className={styles.analysisSummary} aria-label="Nutritional summary">
    {metrics.map(({ label, unit, range, metric }) => <span data-metric={metric} key={label} aria-label={`${label}: ${likelyLabel(range)} ${unit}`}>
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
  const main = roots.filter((node) => ingredientCourse(node, false) === "main").map((node) => node.ingredient.name.trim()).filter(Boolean).join(", ") || analysis.dishType?.trim() || mainRoot?.ingredient.name.trim() || roots[0]?.ingredient.name.trim() || meal.note.trim() || "Analyzed meal";
  const accompaniments = roots
    .filter((node) => node !== mainRoot && ["side", "dessert"].includes(ingredientCourse(node, false) ?? ""))
    .map((node) => node.ingredient.name.trim())
    .filter(Boolean);
  const nutrition = [
    ["Calories", "kcal", analysis.calories, "calories"],
    ["Protein", "g", analysis.proteinGrams, "protein"],
    ["Carbohydrates", "g", analysis.carbohydratesGrams, "carbs"],
    ["Fat", "g", analysis.fatGrams, "fat"],
    ["Added sugar", "g", analysis.addedSugarGrams, "sugar"],
  ] as const;
  return <div className={styles.labMealSummary} aria-label={`Summary for ${SLOT_LABELS[meal.slot]}`}>
    <div className={styles.labMealDetails}><p className={styles.labMealDishes}>{main}</p>{accompaniments.length > 0 && <span className={styles.labMealSides}>{accompaniments.join(" · ")}</span>}</div>
    <div className={styles.labMealNutrition} aria-label="Estimated nutritional values">
      {nutrition.map(([label, unit, range, metric]) => <span data-metric={metric} key={label} aria-label={`${label}: ${likelyLabel(range)} ${unit}`}><small>{label}</small><strong>{likelyLabel(range)} <small>{unit}</small></strong></span>)}
    </div>
  </div>;
}

function MealsMealSummary({ meal }: { meal: MealRecord }) {
  const analysis = meal.analysis;
  if (!analysis) return null;

  const roots = groupMealIngredients(analysis.ingredients);
  const mainRoot = roots.find((node) => ingredientCourse(node, false) === "main" || node.ingredient.kind === "dish");
  const main = roots.filter((node) => ingredientCourse(node, false) === "main").map((node) => node.ingredient.name.trim()).filter(Boolean).join(", ") || analysis.dishType?.trim() || mainRoot?.ingredient.name.trim() || roots[0]?.ingredient.name.trim() || meal.note.trim() || "Analyzed meal";
  const accompaniments = roots
    .filter((node) => node !== mainRoot && ingredientCourse(node, false) === "side")
    .map((node) => node.ingredient.name.trim())
    .filter(Boolean);
  const fallbackAccompaniments = !mainRoot && accompaniments.length === 0
    ? roots.slice(1).map((node) => node.ingredient.name.trim()).filter(Boolean)
    : accompaniments;
  const macro = [
    ["Protein", analysis.proteinGrams],
    ["Carbs", analysis.carbohydratesGrams],
    ["Fat", analysis.fatGrams],
  ].map(([label, range]) => `${label} ${likelyLabel(range as NutritionRange)} g`).join(" · ");

  return <div className={styles.mealsMealSummary} aria-label={`Composition of ${SLOT_LABELS[meal.slot]}`}>
    <div className={styles.mealsMealDetails}>
      <div><span>Main dish</span><strong>{main}</strong></div>
      <div><span>Sides</span><strong>{fallbackAccompaniments.length ? fallbackAccompaniments.join(", ") : "—"}</strong></div>
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
  return <div className={styles.analysisDisplay} aria-label="Analysis correction">
    <div className={styles.textInput}>
      <label htmlFor={`meal-correction-${meal.id}`}>Natural language correction</label>
      <textarea id={`meal-correction-${meal.id}`} rows={3} value={correctionText} maxLength={MEAL_NOTE_MAX_LENGTH} placeholder="e.g. There were two eggs, not one, and a small portion of brown rice." onChange={(event) => setCorrectionText(event.target.value)} aria-describedby={`meal-correction-${meal.id}-count`} />
      <MealNoteCounter id={`meal-correction-${meal.id}-count`} length={correctionText.length} />
      <div className={styles.reviewActions}>
        <button className={styles.analyzeButton} type="button" disabled={!correctionText.trim()} onClick={submitCorrection}>Re-analyze</button>
        <button className={styles.secondaryButton} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  </div>;
}

function MealCompletionControls({ mutationBusy, onEdit, onConfirm, retryable }: {
  mutationBusy: boolean;
  onEdit: () => void;
  onConfirm: () => void;
  retryable: boolean;
}) {
  return <div className={styles.mealCompletionControls}>
    <div className={styles.reviewActions}>
      {retryable && <button className={styles.retryButton} type="button" disabled={mutationBusy} onClick={onConfirm}>Retry confirmation</button>}
      <button className={styles.secondaryButton} type="button" disabled={mutationBusy} onClick={onEdit}>Edit</button>
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
    <h4 className={styles.ratingsHeading}>Sensations</h4>
    <div className={styles.ratings}>
      <RatingScale label={RATING_LABELS.mouthHeat} value={meal.mouthHeat} onChange={(value) => onRating("mouthHeat", value)} />
      <RatingScale label={RATING_LABELS.stomachLoad} value={meal.stomachLoad} onChange={(value) => onRating("stomachLoad", value)} />
    </div>
    {ratingSaveState !== "idle" && <p className={styles.ratingSaveStatus} role={ratingSaveState === "error" ? "alert" : "status"} aria-live={ratingSaveState === "error" ? "assertive" : "polite"}>
      {ratingSaveState === "saving" ? "Saving sensation…" : ratingSaveState === "saved" ? "Sensation saved" : "Sensation could not be saved. Please try again."}
    </p>}
    {correctionMode && <MealCorrectionPanel meal={meal} onCorrection={onCorrection} onCancel={onCancel} />}
  </div>;
}

function MealAnalysisDisclosure(props: MealAnalysisDisclosureProps) {
  return <details className={styles.analysisDetails} open={props.status === "review" || props.correctionMode}>
    <summary>Analysis results</summary>
    <MealAnalysisContent {...props} />
  </details>;
}

function MealAnalysisTrigger({ open, controlsId, onToggle, triggerRef }: { open: boolean; controlsId: string; onToggle: () => void; triggerRef?: RefObject<HTMLButtonElement | null> }) {
  return <button ref={triggerRef} className={styles.analysisTrigger} type="button" aria-expanded={open} aria-controls={controlsId} onClick={onToggle}>
    <span aria-hidden="true">{open ? "▾" : "▸"}</span>Analysis results
  </button>;
}

function PhotoInput({ slot, onFiles, disabled = false, compact = false, single = false }: { slot: MealSlot; onFiles: (files: File[]) => void | Promise<void>; disabled?: boolean; compact?: boolean; single?: boolean }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const readFiles = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")));
    event.target.value = "";
  };
  // Compact mode displays both capture inputs at once without a secondary picker.
  return <div className={`${styles.photoInput} ${compact ? styles.photoInputCompact : ""} ${single ? styles.photoInputSingle : ""}`}>
    <input ref={cameraRef} className={styles.visuallyHidden} tabIndex={-1} aria-hidden="true" type="file" accept="image/*" capture="environment" aria-label={`Take a photo for ${mealLabelWithArticle(slot)}`} disabled={disabled} onChange={readFiles} />
    <input ref={galleryRef} className={styles.visuallyHidden} tabIndex={-1} aria-hidden="true" type="file" accept="image/*" multiple aria-label={`Choose photos for ${mealLabelWithArticle(slot)}`} disabled={disabled} onChange={readFiles} />
    {single ? <>
      <button className={styles.captureButtonCompact} type="button" aria-label={`Take a photo for ${mealLabelWithArticle(slot)}`} disabled={disabled} onClick={() => cameraRef.current?.click()}><Camera size={17} aria-hidden="true" />Camera</button>
      <button className={styles.galleryButtonCompact} type="button" aria-label={`Choose photos for ${mealLabelWithArticle(slot)}`} disabled={disabled} onClick={() => galleryRef.current?.click()}><ImagePlus size={17} aria-hidden="true" />Photos</button>
    </> : <>
      <button className={compact ? styles.captureButtonCompact : styles.captureButton} type="button" aria-label={`Take a photo for ${mealLabelWithArticle(slot)}`} disabled={disabled} onClick={() => cameraRef.current?.click()}><Camera size={17} aria-hidden="true" />{compact ? "Camera" : "Take a photo"}</button>
      <button className={compact ? styles.galleryButtonCompact : styles.galleryButton} type="button" aria-label={`Choose photos for ${mealLabelWithArticle(slot)}`} disabled={disabled} onClick={() => galleryRef.current?.click()}><ImagePlus size={17} aria-hidden="true" />{compact ? "Photos" : "Choose from Photos"}</button>
    </>}
  </div>;
}

function PhotoStrip({ meal, onRemove, onOrigin, onComment, disabled }: { meal: MealRecord; onRemove: (photoId: string) => void; onOrigin: (photoId: string, origin: MealOrigin) => void; onComment?: (photoId: string, comment: string) => void; disabled: boolean }) {
  const availablePhotos = meal.status === "confirmed" ? [] : meal.photos.filter((photo) =>
    (photo.storageStatus ?? "available") === "available" && Boolean(photo.url),
  );
  return <div className={styles.photoGrid} role="list" aria-label={`${availablePhotos.length} meal photo${availablePhotos.length > 1 ? "s" : ""}`}>
    {availablePhotos.map((photo, index) => <figure className={styles.photo} role="listitem" key={photo.id}>
      <div className={styles.photoFrame}>
        {/* User-selected blob URLs and authenticated photo routes cannot use next/image's static loader. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={`Meal photo ${index + 1}`} width={360} height={280} loading="lazy" decoding="async" />
        <button className={styles.photoRemove} type="button" disabled={disabled} onClick={() => onRemove(photo.id)} aria-label={`Remove photo ${index + 1}`}><X size={15} aria-hidden="true" /></button>
      </div>
      <figcaption><span>Photo {index + 1}</span><PhotoOriginPicker photo={photo} onChange={(origin) => onOrigin(photo.id, origin)} /><label htmlFor={`meal-photo-comment-${photo.id}`}>Commentaire (facultatif)</label><input id={`meal-photo-comment-${photo.id}`} type="text" maxLength={240} value={photo.comment ?? ""} disabled={disabled} onChange={(event) => onComment?.(photo.id, event.target.value)} /></figcaption>
    </figure>)}
  </div>;
}

/**
 * Confirmed meals expose only currently available evidence. Successful photo
 * analyses intentionally show a deletion notice after the binary is purged;
 * the existing "Edit" action remains the single way to change a note or
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
    <summary>Photo and note of the day</summary>
    <div className={styles.sourceDetailsBody}>
      {photos.length > 0 && <div className={styles.sourcePhotoGrid} role="list" aria-label={`${photos.length} original meal photo${photos.length > 1 ? "s" : ""}`}>
        {photos.map((photo, index) => <figure className={styles.sourcePhoto} role="listitem" key={photo.id}>
          {/* Authenticated photo routes cannot use next/image's static loader. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={`Original meal photo ${index + 1}`} width={240} height={180} loading="lazy" decoding="async" />
          <figcaption>Photo {index + 1}</figcaption>
        </figure>)}
      </div>}
      {purgedPhotoCount > 0 && <p className={styles.sourceNote}><span>Photo evidence</span>Photo analyzed then purged.</p>}
      {note && <p className={styles.sourceNote}><span>Daily note</span>{note}</p>}
    </div>
  </details>;
}

function MealCard({ meal, slot, saving, processingFiles, mutationBusy, disabled = false, compactEmpty = false, labCompact = false, mealsCompact = false, priority = false, openRequest, onFiles, onRemovePhoto, onDeleteMeal, onOrigin, onPhotoComment, onAnalyze, onCancelAnalysis, onConfirm, onRating, onRetry, onNote, onCorrection, onMarkSkipped, onMarkRecorded, confirmError }: {
  meal: MealRecord | null;
  slot: MealSlot;
  saving: boolean;
  processingFiles: boolean;
  mutationBusy: boolean;
  disabled?: boolean;
  compactEmpty?: boolean;
  labCompact?: boolean;
  mealsCompact?: boolean;
  priority?: boolean;
  openRequest?: number;
  onFiles: (files: File[]) => void | Promise<void>;
  onRemovePhoto: (photoId: string) => void;
  onDeleteMeal: () => void;
  onOrigin: (photoId: string, origin: MealOrigin) => void;
  onPhotoComment?: (photoId: string, comment: string) => void;
  onAnalyze: () => void;
  onCancelAnalysis: () => void;
  onConfirm: () => void;
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
  const autoConfirmMealRef = useRef<string | null>(null);
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
  const visibleStatus = meal ? statusLabel(meal) : unavailable ? "Skipped" : "";
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

  // A legacy `review` response means the existing confirmation request is
  // still pending. Only the persisted confirmed status gets completion UI.
  const completed = Boolean(meal?.analysis && !meal.error && status === "confirmed");

  useEffect(() => {
    if (status !== "review" || !meal?.analysis || meal.error) {
      if (status !== "review") autoConfirmMealRef.current = null;
      return;
    }
    if (autoConfirmMealRef.current === meal.id) return;
    autoConfirmMealRef.current = meal.id;
    onConfirm();
  }, [meal?.analysis, meal?.error, meal?.id, onConfirm, status]);

  return <article className={`${styles.mealCard} ${!meal ? styles.mealCardEmpty : ""} ${completed ? styles.mealCardConfirmed : ""} ${priority ? styles.mealCardPriority : ""}`} aria-labelledby={headingId} aria-busy={saving || processingFiles}>
    <header className={styles.mealHeader}>
      <div className={styles.mealTitle}><h3 id={headingId} tabIndex={-1}>{SLOT_LABELS[slot]}</h3></div>
      {labCompact ? <div className={styles.labHeaderActions}>
        {meal && visibleStatus ? <span className={styles.mealStatus} data-status={skipped ? "skipped" : meal.error ? "error" : completed ? "confirmed" : meal.status}>{visibleStatus}</span> : null}
        {meal?.analysis && !skipped && (status === "review" || status === "confirmed") ? <MealCompletionControls mutationBusy={mutationBusy} onConfirm={onConfirm} retryable={Boolean(meal.error)} onEdit={() => { setCorrectionMode(true); setAnalysisOpen(true); }} /> : null}
        {!skipped && status === "draft" ? <button className={styles.mealHeaderSkip} type="button" disabled={mutationBusy} onClick={onMarkSkipped}>Skip</button> : null}
      </div> : mealsCompact ? <div className={styles.mealHeaderMeta}>
        {meal?.analysis && !skipped && <span className={styles.mealCalories}>{likelyLabel(meal.analysis.calories)} kcal</span>}
        {visibleStatus && <span className={styles.mealStatus} data-status={skipped ? "skipped" : meal?.error ? "error" : completed ? "confirmed" : meal?.status ?? "empty"}>{completed && !skipped ? <Check size={14} aria-hidden="true" /> : null}{visibleStatus}</span>}
      </div> : visibleStatus && <span className={styles.mealStatus} data-status={skipped ? "skipped" : meal?.error ? "error" : completed ? "confirmed" : meal?.status ?? "empty"}>{completed && !skipped ? <Check size={14} aria-hidden="true" /> : null}{visibleStatus}</span>}
    </header>
    {skipped && <div className={styles.skippedState} role="status"><span>Skipped · this slot is excluded from the score.</span><button className={styles.secondaryButton} type="button" disabled={mutationBusy} onClick={onMarkRecorded}>Log this meal</button></div>}
    {unavailable && <div className={styles.skippedState} role="status">Slot skipped in journal.</div>}
    {compactDraftCapture ? <div className={compactEmptyState ? styles.emptyMealPrompt : `${styles.mealBody} ${styles.draftMeal}`} role="group" aria-label={meal ? SLOT_LABELS[slot] : `${SLOT_LABELS[slot]} not logged`}>
      {hasPhotos && <PhotoStrip key="photos" meal={meal as MealRecord} onRemove={onRemovePhoto} onOrigin={onOrigin} onComment={onPhotoComment} disabled={mutationBusy || disabled || skipped} />}
      <MealTextInput key="text" slot={slot} meal={meal} disabled={processingFiles || mutationBusy || disabled || skipped} onNote={onNote} onAnalyze={onAnalyze} />
      <div className={compactEmptyState ? styles.emptyMealActions : styles.actionsRow}>
        {compactEmptyState ? <PhotoInput slot={slot} onFiles={handleFiles} disabled={processingFiles || disabled || skipped} compact single /> : <PhotoInput slot={slot} onFiles={handleFiles} disabled={processingFiles || disabled || skipped} />}
        {labCompact && <button className={styles.analyzeButton} type="button" aria-label={`Analyze ${mealLabelWithArticle(slot)}`} aria-describedby={hasEvidence ? undefined : analyzeHintId} disabled={!hasEvidence || processingFiles || mutationBusy || disabled || skipped} onClick={onAnalyze}><span>Analyze meal</span><ArrowRight size={17} aria-hidden="true" /></button>}
        {!skipped && !labCompact && <button className={styles.emptyNoteButton} type="button" disabled={mutationBusy} onClick={onMarkSkipped}>Skipped</button>}
        {!hasEvidence && <p id={analyzeHintId} className={styles.photoRequired}>Add a photo or describe your meal to start analysis.</p>}
      </div>
    </div> : null}
    {compactEmptyState && !compactDraftCapture && <div className={styles.emptyMealPrompt} role="group" aria-label={`${SLOT_LABELS[slot]} not logged`}>
      <div className={styles.emptyMealActions}>
        <button className={styles.emptyNoteButton} type="button" onClick={() => setEntryStarted(true)}>Write note</button>
        <PhotoInput slot={slot} onFiles={handleFiles} disabled={processingFiles || disabled} compact />
        <button className={styles.emptyNoteButton} type="button" disabled={mutationBusy} onClick={onMarkSkipped}>Skipped</button>
      </div>
    </div>}
    {!inactive && status === "accepted" && <div className={styles.analyzingState} role="status" aria-live="polite"><strong>Analysis queued</strong><span>It will continue in the background.</span><button className={styles.secondaryButton} type="button" onClick={onCancelAnalysis}>Cancel</button></div>}
    {!inactive && status === "analyzing" && <div className={styles.analyzingState} role="status" aria-live="polite"><span className={styles.progressTrace} aria-hidden="true" /><strong>Analyzing…</strong><button className={styles.secondaryButton} type="button" onClick={onCancelAnalysis}>Cancel</button></div>}
    {!inactive && !compactEmptyState && !compactDraftCapture && status !== "accepted" && status !== "analyzing" && <div className={`${styles.mealBody} ${status === "draft" ? styles.draftMeal : ""}`}>
      {hasPhotos && <PhotoStrip meal={meal as MealRecord} onRemove={onRemovePhoto} onOrigin={onOrigin} onComment={onPhotoComment} disabled={mutationBusy || disabled || skipped} />}
      <MealTextInput key={`meal-input-${slot}`} slot={slot} meal={meal} disabled={processingFiles || mutationBusy || disabled || skipped} onNote={onNote} onAnalyze={onAnalyze} />
      {status === "draft" && <div className={styles.actionsRow}>
        <PhotoInput slot={slot} onFiles={handleFiles} disabled={processingFiles || disabled || skipped} />
        <button className={styles.analyzeButton} type="button" aria-label={`Analyze ${mealLabelWithArticle(slot)}`} aria-describedby={hasEvidence ? undefined : analyzeHintId} disabled={!canAnalyze || processingFiles || mutationBusy || disabled || skipped} onClick={onAnalyze}>
          <Sparkles size={17} aria-hidden="true" />Analyze
        </button>
        <button className={styles.secondaryButton} type="button" disabled={mutationBusy} onClick={onMarkSkipped}>Skipped</button>
        {!hasEvidence && <p id={analyzeHintId} className={styles.photoRequired}>Add a photo or describe your meal to start analysis.</p>}
      </div>}
      {status === "error" && <div className={styles.errorState} role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Analysis interrupted</strong><span>{visibleAnalysisError(meal?.error)}</span></div><button className={styles.retryButton} type="button" disabled={mutationBusy} onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Try again</button></div>}
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
          <MealCompletionControls mutationBusy={mutationBusy} onConfirm={onConfirm} retryable={Boolean(meal.error)} onEdit={() => setCorrectionMode(true)} />
        </>}
        {labCompact && confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}
      </>}
      {(status === "review" || status === "confirmed") && meal?.error && <p className={styles.confirmError} role="alert">Re-analysis interrupted. The previous analysis is retained. {visibleAnalysisError(meal.error)}</p>}
      {meal && !disabled && !skipped && (meal.analysis || !meal.id.startsWith("meal-")) && <div className={styles.mealDeleteRow}>
        <button className={styles.deleteMealButton} type="button" disabled={mutationBusy} onClick={onDeleteMeal}>Delete meal</button>
      </div>}
    </div>}
  </article>;
}

function MealHeaderMetric({ label, value, unit, target }: { label: string; value: number | null; unit: string; target: number | null }) {
  const valueLabel = value === null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  const targetLabel = target === null ? null : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(target);
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
      <h1 id="meal-journal-title">Nutrition</h1>
      <div className={styles.headerMetrics} role="group" tabIndex={0} aria-label="Daily nutrition summary">
        <MealHeaderMetric label="Calories" value={totals?.calories ?? null} unit="kcal" target={targets.caloriesKcal.likely} />
        <MealHeaderMetric label="Protein" value={totals?.protein ?? null} unit="g" target={targets.proteinG.likely} />
        <MealHeaderMetric label="Added sugar" value={totals?.addedSugar ?? null} unit="g" target={null} />
        <MealHeaderMetric label="Fat" value={totals?.fat ?? null} unit="g" target={targets.fatG.likely} />
        <MealHeaderMetric label="Carbohydrates" value={totals?.carbs ?? null} unit="g" target={targets.carbsG.likely} />
      </div>
      {onToggleTargets && <button className={styles.mealsTargetButton} type="button" aria-label="Edit daily targets" aria-expanded={targetsExpanded} aria-controls="meal-target-editor" onClick={onToggleTargets}><Pencil size={14} aria-hidden="true" /></button>}
    </header>;
  }

  return <header className={styles.pageHeader}>
    <div><h1 id="meal-journal-title">Nutrition</h1></div>
    <div className={styles.dayProgress} aria-label={`Calories: ${calories ?? "unavailable"} of ${calorieTarget} kcal. Protein: ${protein ?? "unavailable"} of ${proteinTarget} grams.`}>
      <ScoreRing kind="recovery" label="% calories" score={calorieProgressValue} decorative animate />
    </div>
  </header>;
}

function MealHomeHeader() {
  return <header className={styles.homeHeader}>
    <div><span className={styles.eyebrow}>Daily journal</span><h2 id="meal-journal-title">Nutrition</h2></div>
  </header>;
}

function MealLabHeader({
  onToggleTargets,
  targetsExpanded = false,
  calories = null,
  targetCalories = 2400,
}: {
  onToggleTargets?: () => void;
  targetsExpanded?: boolean;
  calories?: number | null;
  targetCalories?: number | null;
}) {
  const calVal = calories ?? 0;
  const targetVal = targetCalories ?? 2400;
  const calPct = targetVal > 0 ? Math.min(100, Math.round((calVal / targetVal) * 100)) : 0;
  return (
    <header className="pb-4 border-b border-hairline space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div><h2 id="meal-journal-title" className="workspace-panel-title font-serif text-content-primary font-normal">Nutrition Log</h2></div>
        <div className="flex items-center gap-2">
          {onToggleTargets && (
            <button
              type="button"
              className="inline-flex min-h-9 min-w-9 items-center justify-center p-2 text-content-secondary hover:text-content-primary border border-hairline hover:border-hairline-light hover:bg-surface-elevated rounded transition-all duration-150 interactive-press active:scale-[0.97]"
              aria-label="Edit daily targets"
              title="Edit daily targets"
              aria-expanded={targetsExpanded}
              aria-controls="meal-target-editor"
              onClick={onToggleTargets}
            >
              <Pencil size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden bg-hairline-light border border-hairline">
        <div className="h-full bg-sage rounded-full transition-bar" style={{ width: `${calPct}%` }} />
      </div>
    </header>
  );
}

export function MealJournal({ readOnly = false, date, today: providedToday, initialData, api, className, disabledSlots = [], selectedDate: selectedDateProp, onDateChange, showDateNavigation = true, sharedDateNavigation, children, historyDays, variant = "page", publishMealTotals = false, initialTargets, initialEffectiveTargets, initialEffortTargetContext, allowTargetEditing, designVariant = "v1" }: Props) {
  const today = providedToday ?? todayInLocalTime();
  const requestedDate = date ?? initialData?.date ?? today;
  const initialDate = requestedDate > today ? today : requestedDate;
  const [internalSelectedDate, setInternalSelectedDate] = useState(initialDate);
  const selectedDate = selectedDateProp ?? internalSelectedDate;
  const prioritizesCurrentMeal = variant === "home" || variant === "lab";
  const [localNow, setLocalNow] = useState(() => new Date());
  useEffect(() => {
    if (!prioritizesCurrentMeal) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      const current = new Date();
      const nextBoundary = nextMealPriorityBoundary(current);
      const delay = Math.max(1_000, nextBoundary.getTime() - current.getTime() + 50);
      timer = setTimeout(() => {
        setLocalNow(new Date());
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [prioritizesCurrentMeal]);
  const currentMealSlot = prioritizesCurrentMeal && selectedDate === localDateFor(localNow)
    ? mealSlotForLocalTime(localNow)
    : null;
  const [data, setData] = useState<MealJournalData | null>(() => initialData ? normalizeData(initialData, initialDate) : null);
  const [analysisProgress, setAnalysisProgress] = useState<Partial<Record<MealSlot, MealAnalysisProgress>>>({});
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
  const [mealDistributionDraft, setMealDistributionDraft] = useState(() => mealTargetDistributionOf(initialTargets ?? DEFAULT_NUTRITION_TARGETS));
  const [targetsExpanded, setTargetsExpanded] = useState(false);
  const [entryRequest, setEntryRequest] = useState<{ slot: MealSlot; sequence: number } | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [targetDistributionError, setTargetDistributionError] = useState<string | null>(null);
  const targetEditingEnabled = !readOnly && (allowTargetEditing ?? variant !== "lab");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [analyzingSlots, setAnalyzingSlots] = useState<readonly MealSlot[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "photo"; slot: MealSlot; photoId: string } | { kind: "meal"; slot: MealSlot } | null>(null);
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
      setLoadError(error instanceof Error ? error.message : "Meals are currently unavailable.");
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
    .flatMap(([slot, meal]) => meal && (meal.status === "accepted" || meal.status === "analyzing") ? [`${slot}:${meal.id}`] : [])
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
          const response = await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(meal.id)}/analyze`, { cache: "no-store" }, MEAL_ANALYSIS_STATUS_TIMEOUT_MS, { operation: "load" });
          const body = await readJson(response) as { meal?: unknown };
          if (cancelled || !body.meal) return;
          const next = normalizeMeal(apiMealToRecord(body.meal), selectedDate, slot);
          if (next.status === "accepted" || next.status === "analyzing") setAnalysisProgress((current) => ({ ...current, [slot]: { phase: next.status === "accepted" ? "En attente de l’analyse…" : "Analyse du repas en cours…", foods: [] } }));
          setData((current) => current ? { ...current, meals: { ...current.meals, [slot]: next } } : current);
        } catch {
          // A temporary reconnect failure must not turn a durable job into a
          // false error. The next tick or visibility event retries it.
        }
      }));
    };
    let timer: number | null = null;
    let delayIndex = 0;
    const delays = [2_000, 5_000, 10_000];
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
      const dialog = document.getElementById("meal-delete-dialog");
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
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Nutrition targets are unavailable.");
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
      if (!migrated.ok) throw new Error("Local targets could not be synchronized.");
      applyLoadedTargets(localTargets, nutritionTargetsForEffort(localTargets, context), context, selectedDate);
      return;
    }
    applyLoadedTargets(parsed, serverEffective, context, selectedDate);
    saveNutritionTargets(parsed);
  }, [applyLoadedTargets, selectedDate]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshTargets(controller.signal).catch((error) => {
      if (error instanceof Error && error.name !== "AbortError") setTargetError("Using local targets: Soma synchronization is unavailable.");
    });
    const interval = window.setInterval(() => {
      void refreshTargets().catch(() => undefined);
    }, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [refreshTargets]);

  useEffect(() => {
    setMealDistributionDraft(mealTargetDistributionOf(targets));
    setTargetDistributionError(null);
  }, [targets]);

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

  const updateTargetLikely = useCallback((key: "caloriesKcal" | "proteinG" | "fatG" | "carbsG" | "fiberG" | "addedSugarG", raw: string) => {
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
          .catch(() => setTargetError("Change saved on this device, but not yet synchronized with Soma."));
      }, 500);
      return next;
    });
  }, []);

  const updateMealDistribution = useCallback((slot: MealTargetSlot, raw: string) => {
    const value = raw === "" ? null : Number(raw);
    if (value === null || !Number.isFinite(value) || value < 0 || value > 100) return;
    setMealDistributionDraft((current) => {
      const next = { ...current, [slot]: value };
      const total = MEAL_TARGET_SLOTS.reduce((sum, item) => sum + next[item], 0);
      if (Math.abs(total - 100) > 0.001) {
        setTargetDistributionError(`La répartition doit totaliser 100 % (actuellement ${total} %).`);
        return next;
      }
      const nextTargets: NutritionTargets = {
        ...targetBaseRef.current,
        mealDistribution: next,
      };
      const nextEffective = nutritionTargetsForEffort(nextTargets, effortTargetContextRef.current);
      targetBaseRef.current = nextTargets;
      effectiveTargetsRef.current = nextEffective;
      setTargets(nextTargets);
      setEffectiveTargets(nextEffective);
      setTargetDistributionError(null);
      saveNutritionTargets(nextTargets);
      if (targetSaveTimer.current) clearTimeout(targetSaveTimer.current);
      targetSaveTimer.current = setTimeout(() => {
        void fetch("/api/nutrition-targets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets: nextTargets }) })
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
        ? `${SLOT_LABELS[slot]} marked as "skipped". This slot will not trigger analysis.`
        : `${SLOT_LABELS[slot]} restored. You can now log details.`);
      return true;
    } catch (error) {
      setData((loaded) => loaded ? { ...loaded, meals: { ...loaded.meals, [slot]: previous } } : loaded);
      setConfirmError((errors) => ({ ...errors, [slot]: error instanceof Error ? error.message : "The slot status could not be saved." }));
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
        setStatusMessage("Journal full: edit an existing meal to add this item.");
        return;
      }
      const existing = current?.meals[target]?.note.trim() ?? "";
      const combined = existing ? `${existing}\n${text}`.slice(0, MEAL_NOTE_MAX_LENGTH) : text;
      updateMeal(target, (meal) => ({ ...meal, note: combined, status: "draft", error: null }));
      setStatusMessage(`Item copied into ${SLOT_LABELS[target].toLowerCase()}. Today’s photo and note take precedence.`);
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
      setFileError(error instanceof Error ? error.message : "This photo could not be prepared. Please retake it in JPEG or PNG format.");
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
    setPendingDelete({ kind: "photo", slot, photoId });
  };

  const removeMeal = (slot: MealSlot) => {
    const meal = dataRef.current?.meals[slot];
    if (!meal || (!meal.analysis && meal.id.startsWith("meal-")) || inFlightSlots.current.has(slot)) return;
    pendingDeleteTrigger.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setPendingDelete({ kind: "meal", slot });
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
    setSavingSlot(pending.slot);
    let mealDeleted = false;
    try {
      if (pending.kind === "meal") {
        await (api?.removeMeal ? api.removeMeal(meal.id) : defaultRemoveMeal(meal.id));
        setData((current) => current ? { ...current, meals: { ...current.meals, [pending.slot]: null } } : current);
        setStatusMessage(`${SLOT_LABELS[pending.slot]} deleted.`);
        mealDeleted = true;
      } else {
        await (api?.removePhoto ? api.removePhoto(meal.id, pending.photoId) : defaultRemovePhoto(meal.id, pending.photoId));
        removePhotoFromState(pending.slot, pending.photoId);
      }
    } catch (error) {
      const fallback = pending.kind === "meal" ? "This meal could not be deleted." : "This photo could not be deleted.";
      setFileError(error instanceof Error ? error.message : fallback);
    } finally {
      inFlightSlots.current.delete(pending.slot);
      setSavingSlot(null);
      if (mealDeleted && typeof window !== "undefined") {
        window.requestAnimationFrame(() => document.getElementById(`meal-${pending.slot}-title`)?.focus({ preventScroll: true }));
      } else {
        pendingDeleteTrigger.current?.focus();
      }
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
      setFileError(error instanceof Error ? error.message : "The photo origin could not be saved.");
    }
  };

  const setPhotoComment = (slot: MealSlot, photoId: string, comment: string) => {
    updateMeal(slot, (current) => ({ ...current, photos: current.photos.map((photo) => photo.id === photoId ? { ...photo, comment: comment.slice(0, 240) } : photo), status: "draft", error: null }));
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
        setStatusMessage("Meal confirmed. Photo and note can still be updated.");
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            document.getElementById(`meal-${meal.slot}-title`)?.focus({ preventScroll: true });
          });
        }
      }
      return true;
    } catch (error) {
      setConfirmError((previous) => ({ ...previous, [meal.slot]: error instanceof Error ? error.message : "The meal could not be saved." }));
      updateMeal(meal.slot, (current) => ({ ...current, status: current.analysis ? "review" : "draft", error: error instanceof Error ? error.message : "The meal could not be saved." }));
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
        setFileError(`This meal contains ${activePhotos.length} photos, but a maximum of ${MAX_MEAL_PHOTOS} is allowed. Remove photos before analyzing again.`);
        return;
      }
    } else if (!hasTextForAnalyze) {
      setFileError("Add a photo or describe your meal before analyzing.");
      return;
    }
    inFlightSlots.current.add(slot);
    setAnalyzingSlots((previous) => previous.includes(slot) ? previous : [...previous, slot]);
    cancelledAnalysisIds.current.delete(meal.id);
    updateMeal(slot, (current) => ({ ...current, status: "accepted", error: null }));
    setAnalysisProgress((prev) => ({ ...prev, [slot]: { phase: "Connexion…", foods: [] } }));
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
      const analyzed = await (api?.analyze ? api.analyze({ date: selectedDate, slot, meal, files, photoFiles, ...(correction ? { correction } : {}) }) : defaultAnalyze({ date: selectedDate, slot, meal, files, photoFiles, ...(correction ? { correction } : {}) }, { onMealCreated: (mealId) => updateMeal(slot, (current) => ({ ...current, id: mealId })), onPhotosUploaded: reconcileUploadedPhotos, onProgress: (progress) => setAnalysisProgress((prev) => ({ ...prev, [slot]: progress })) }));
      if (cancelledAnalysisIds.current.has(meal.id)) {
        // Annulation demandée pendant l’envoi : le résultat tardif est ignoré
        // et le brouillon local est conservé tel quel.
        updateMeal(slot, (current) => ({ ...current, status: current.analysis ? "review" : "draft", error: null }));
        return;
      }
      const nextStatus = analyzed.status === "error" ? "error" : analyzed.status === "accepted" || analyzed.status === "analyzing"
        ? analyzed.status
        : (analyzed.analysis || analyzed.status === "confirmed")
          ? (analyzed.status === "confirmed" ? "confirmed" : "review")
          : "draft";
      updateMeal(slot, (current) => ({ ...current, ...normalizeMeal({ ...analyzed, note: typeof analyzed.note === "string" && analyzed.note ? analyzed.note : current.note, photos: analyzed.photos?.length ? analyzed.photos : current.photos, status: nextStatus, error: nextStatus === "error" ? analyzed.error : null }, selectedDate, slot), status: nextStatus }));
    } catch (error) {
      updateMeal(slot, (current) => ({ ...current, status: current.analysis ? "review" : "error", error: error instanceof Error ? error.message : "Analysis could not be completed." }));
    } finally {
      inFlightSlots.current.delete(slot);
      setAnalyzingSlots((previous) => previous.filter((entry) => entry !== slot));
      setAnalysisProgress((prev) => { const next = {...prev}; delete next[slot]; return next; });
    }
  };

  const cancelAnalysis = (slot: MealSlot) => {
    const meal = dataRef.current?.meals[slot];
    if (!meal) return;
    cancelledAnalysisIds.current.add(meal.id);
    inFlightSlots.current.delete(slot);
    setAnalyzingSlots((previous) => previous.filter((entry) => entry !== slot));
    setAnalysisProgress((prev) => { const next = {...prev}; delete next[slot]; return next; });
    updateMeal(slot, (current) => ({ ...current, status: current.analysis ? "review" : "draft", error: null }));
    setStatusMessage("Analysis cancelled. Draft is preserved.");
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
    <nav className={`${styles.historyNavigation} ${showDateArrows ? styles.historyNavigationWithArrows : ""} personal-lab-day-strip`} aria-label="Meal history">
      {showDateArrows && <button className={styles.historyArrow} type="button" disabled={navigationDisabled} aria-label="Previous day" onClick={() => selectDate(shiftIsoDate(selectedDate, -1))}>‹</button>}
      <div className={`${styles.weekStrip} ${variant === "meals" ? styles.mealsWeekStrip : ""} personal-lab-day-strip__days`} role="group" aria-label="Available days">
        {visibleHistoryDates.map((historyDate) => {
          const label = compactDayLabel(historyDate, today);
          return <button key={historyDate} type="button" disabled={navigationDisabled} className={historyDate === selectedDate ? styles.weekDaySelected : styles.weekDay} aria-pressed={historyDate === selectedDate} aria-current={historyDate === selectedDate ? "date" : undefined} aria-label={formatDate(historyDate)} onClick={() => selectDate(historyDate)}><span>{label.weekday}</span><small>{label.day}</small><span className="sr-only">{formatDate(historyDate)}</span></button>;
        })}
      </div>
      {showDateArrows && <button className={styles.historyArrow} type="button" disabled={navigationDisabled || selectedDate >= today} aria-label="Next day" onClick={() => selectDate(shiftIsoDate(selectedDate, 1))}>›</button>}
    </nav>
    {showDatePicker && <div className={styles.datePickerRow}>
      <label htmlFor="meal-date-picker">Select date</label>
      <input id="meal-date-picker" className={styles.datePicker} type="date" value={selectedDate} max={today} min={shiftIsoDate(today, -89)} disabled={navigationDisabled} onChange={(event) => { if (event.target.value) selectDate(event.target.value); }} />
    </div>}
  </> : null;
  const dateNavigation = sharedDateNavigation ?? internalDateNavigation;
  const availableMealSlot = data ? firstAvailableMealSlot(data.meals, disabledSlots) : null;
  const openAvailableMeal = () => {
    if (!availableMealSlot || navigationDisabled) return;
    setEntryRequest((current) => ({ slot: availableMealSlot, sequence: (current?.sequence ?? 0) + 1 }));
  };

  const readyData = data ?? emptyData(selectedDate);
  const labCalories = currentDayTotal?.calories ?? 0;
  const labTargetCalories = effectiveTargets?.caloriesKcal?.likely ?? targets?.caloriesKcal?.likely ?? 2400;

  const pageHeader = variant === "home"
    ? <MealHomeHeader />
    : variant === "lab"
    ? <MealLabHeader
        onToggleTargets={targetEditingEnabled ? () => setTargetsExpanded((expanded) => !expanded) : undefined}
        targetsExpanded={targetsExpanded}
        calories={labCalories}
        targetCalories={labTargetCalories}
      />
    : <MealPageHeader
        totals={currentDayTotal}
        targets={variant === "meals" ? targets : effectiveTargets}
        mealsVariant={variant === "meals"}
        targetsExpanded={targetsExpanded}
        onToggleTargets={variant === "meals" ? () => setTargetsExpanded((expanded) => !expanded) : undefined}
      />;
  const rootClass = [styles.root, className, variant === "lab" ? styles.labRoot : "", variant === "meals" ? styles.mealsPageRoot : ""].filter(Boolean).join(" ");

  if (loadState === "loading") return <section className={rootClass} aria-labelledby="meal-journal-title">{pageHeader}{dateNavigation}<div className={styles.loadingState} role="status" aria-live="polite"><span className={styles.progressTrace} aria-hidden="true" /><span>Loading meals…</span></div></section>;
  if (loadState === "error") return <section className={rootClass} aria-labelledby="meal-journal-title">{pageHeader}{dateNavigation}<div className={styles.errorState} role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Unable to load meals</strong><span>{loadError}</span></div><button className={styles.retryButton} type="button" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" />Try again</button></div></section>;

  if (readOnly) return <section className={rootClass} aria-labelledby="meal-journal-title">
    {pageHeader}{dateNavigation}
    <div className={styles.mealList}>{MEAL_SLOTS.map((slot) => {
      const meal = readyData.meals[slot] ?? null;
      return <article className={styles.mealCard} key={slot} aria-label={SLOT_LABELS[slot]}>
        <h3>{SLOT_LABELS[slot]}</h3>
        {meal?.entryState === "skipped" ? <p>Skipped</p> : !meal ? <p>No meal logged.</p> : <>
          <p>{statusLabel(meal)}</p>
          {meal.analysis && <LabMealSummary meal={meal} />}
          <MealSourceEvidence meal={meal} />
          {meal.error && <p role="alert">{visibleAnalysisError(meal.error)}</p>}
        </>}
      </article>;
    })}</div>
  </section>;

  const slotBusy = (slot: MealSlot) => savingSlot === slot || analyzingSlots.includes(slot);
  return <section className={rootClass} aria-labelledby="meal-journal-title">
    {pageHeader}
    {dateNavigation}
    {statusMessage && <p className={styles.saveNotice} role="status">{statusMessage}</p>}
    {variant !== "lab" && variant !== "meals" && <div className={styles.targetControls}>
      <button className={styles.targetEditButton} type="button" aria-label="Edit daily targets" aria-expanded={targetsExpanded} aria-controls="meal-target-editor" onClick={() => setTargetsExpanded((expanded) => !expanded)}><Pencil size={16} aria-hidden="true" /></button>
    </div>}
    {targetsExpanded && targetEditingEnabled && <div id="meal-target-editor" className={styles.targetEditor}>
      <fieldset className={styles.targetGroup}>
        <legend>Daily targets</legend>
        <div className={styles.targetFields}>
          <label><span>Calories (kcal)</span><input type="number" min="0" inputMode="numeric" aria-label="Calorie target, estimated value" value={targets.caloriesKcal.likely} onChange={(event) => updateTargetLikely("caloriesKcal", event.target.value)} /></label>
          <label><span>Protein (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Protein target, estimated value" value={targets.proteinG.likely} onChange={(event) => updateTargetLikely("proteinG", event.target.value)} /></label>
          <label><span>Fat (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Fat target, estimated value" value={targets.fatG.likely} onChange={(event) => updateTargetLikely("fatG", event.target.value)} /></label>
          <label><span>Carbohydrates (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Carbohydrate target, estimated value" value={targets.carbsG.likely} onChange={(event) => updateTargetLikely("carbsG", event.target.value)} /></label>
          <label><span>Fiber (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Fiber target, estimated value" value={targets.fiberG.likely} onChange={(event) => updateTargetLikely("fiberG", event.target.value)} /></label>
          <label><span>Added sugar (g)</span><input type="number" min="0" inputMode="decimal" aria-label="Added sugar target, estimated value" value={targets.addedSugarG.likely} onChange={(event) => updateTargetLikely("addedSugarG", event.target.value)} /></label>
        </div>
      </fieldset>
      <fieldset className={styles.targetGroup}>
        <legend>Meal distribution</legend>
        <p className={styles.targetHelp}>Each meal column compares its intake with this share of the daily target.</p>
        <div className={styles.distributionFields}>
          {MEAL_TARGET_SLOTS.map((slot) => <label key={slot}><span>{SLOT_LABELS[slot]}{slot === "snack" ? " (optional)" : ""}</span><span className={styles.percentInput}><input type="number" min="0" max="100" step="1" inputMode="numeric" aria-label={`${SLOT_LABELS[slot]} meal distribution`} value={mealDistributionDraft[slot]} onChange={(event) => updateMealDistribution(slot, event.target.value)} /><small>%</small></span></label>)}
        </div>
        <p className={`${styles.distributionTotal} ${targetDistributionError ? styles.distributionTotalError : ""}`} role={targetDistributionError ? "alert" : "status"}>{targetDistributionError ?? `Total: ${MEAL_TARGET_SLOTS.reduce((sum, slot) => sum + mealDistributionDraft[slot], 0)} %`}</p>
      </fieldset>
    </div>}
    {targetError && <p className={styles.confirmError} role="status">{targetError}</p>}
    {fileError && <div className={styles.fileError} role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{fileError}</span><button className={styles.dismissError} type="button" onClick={() => setFileError(null)} aria-label="Dismiss photo message"><X size={16} aria-hidden="true" /></button></div>}
    {variant === "meals" ? <div className={styles.mealsWorkbench}>
      <section className={styles.mealsJournalPanel} aria-labelledby="meals-journal-panel-title">
        <header className={styles.mealsJournalHeader}>
          <h2 id="meals-journal-panel-title">Meal journal</h2>
          <button type="button" aria-label="Add a meal" title="Add a meal" disabled={!availableMealSlot || navigationDisabled} onClick={openAvailableMeal}><Plus size={17} aria-hidden="true" /></button>
        </header>
        <div className={styles.mealList}>{MEAL_SLOTS.map((slot) => {
      const meal = readyData.meals[slot] ?? null;
          const priority = currentMealSlot === slot && !disabledSlots.includes(slot) && meal?.entryState !== "skipped";
          return <div id={`meal-${slot}`} className={priority ? styles.prioritySlot : undefined} key={`${selectedDate}-${slot}`}><MealCard meal={meal} slot={slot} priority={priority} compactEmpty mealsCompact openRequest={entryRequest?.slot === slot ? entryRequest.sequence : undefined} disabled={disabledSlots.includes(slot)} saving={savingSlot === slot} processingFiles={processingFiles} mutationBusy={slotBusy(slot)} confirmError={confirmError[slot]} onFiles={(files) => addFiles(slot, files)} onRemovePhoto={(photoId) => removePhoto(slot, photoId)} onDeleteMeal={() => removeMeal(slot)} onOrigin={(photoId, origin) => void setPhotoOrigin(slot, photoId, origin)} onPhotoComment={(photoId, comment) => setPhotoComment(slot, photoId, comment)} onAnalyze={() => void analyzeMeal(slot)} onCancelAnalysis={() => cancelAnalysis(slot)} onConfirm={() => { if (meal) void saveMeal(meal, "confirmed", { queued: true, announce: false }); }} onCorrection={(correction) => void analyzeMeal(slot, correction)} onRating={(key, value) => setRating(slot, key, value)} onRetry={() => void analyzeMeal(slot)} onNote={(note) => setNote(slot, note)} onMarkSkipped={() => void changeEntryState(slot, "skipped")} onMarkRecorded={() => void changeEntryState(slot, "recorded")} /></div>;
        })}</div>
      </section>
      <div className={styles.mealsSecondary}>{children}</div>
    </div> : <div className={styles.mealList}>{MEAL_SLOTS.map((slot) => {
        const meal = readyData.meals[slot] ?? null;
        const priority = currentMealSlot === slot && !disabledSlots.includes(slot) && meal?.entryState !== "skipped";
        return <div id={`meal-${slot}`} className={priority ? styles.prioritySlot : undefined} key={`${selectedDate}-${slot}`}>{
          variant === "lab" ? (
            <>
              <LabMealCard
                meal={meal}
                slot={slot}
                designVariant={designVariant}
                targets={effectiveTargets}
                disabled={disabledSlots.includes(slot)}
                saving={savingSlot === slot}
                processingFiles={processingFiles}
                mutationBusy={slotBusy(slot)}
                confirmError={confirmError[slot]}
                analysisProgress={analysisProgress[slot]}
                onFiles={(files) => addFiles(slot, files)}
                onRemovePhoto={(photoId) => removePhoto(slot, photoId)}
                onPhotoComment={(photoId, comment) => setPhotoComment(slot, photoId, comment)}
                onAnalyze={() => void analyzeMeal(slot)}
                onCancelAnalysis={() => cancelAnalysis(slot)}
                onConfirm={() => { if (meal) void saveMeal(meal, "confirmed", { queued: true, announce: false }); }}
                onCorrection={(correction) => void analyzeMeal(slot, correction)}
                onNote={(note) => setNote(slot, note)}
                onEdit={() => setNote(slot, meal?.note?.trim() || meal?.analysis?.dishType || "")}
                onMarkSkipped={() => void changeEntryState(slot, "skipped")}
                onMarkRecorded={() => void changeEntryState(slot, "recorded")}
                onDeleteMeal={!disabledSlots.includes(slot) ? () => removeMeal(slot) : undefined}
              />
            </>
          ) : (
            <MealCard meal={meal} slot={slot} priority={priority} compactEmpty={variant !== "page"} labCompact={false} openRequest={entryRequest?.slot === slot ? entryRequest.sequence : undefined} disabled={disabledSlots.includes(slot)} saving={savingSlot === slot} processingFiles={processingFiles} mutationBusy={slotBusy(slot)} confirmError={confirmError[slot]} onFiles={(files) => addFiles(slot, files)} onRemovePhoto={(photoId) => removePhoto(slot, photoId)} onDeleteMeal={() => removeMeal(slot)} onOrigin={(photoId, origin) => void setPhotoOrigin(slot, photoId, origin)} onAnalyze={() => void analyzeMeal(slot)} onCancelAnalysis={() => cancelAnalysis(slot)} onConfirm={() => { if (meal) void saveMeal(meal, "confirmed", { queued: true, announce: false }); }} onCorrection={(correction) => void analyzeMeal(slot, correction)} onRating={(key, value) => setRating(slot, key, value)} onRetry={() => void analyzeMeal(slot)} onNote={(note) => setNote(slot, note)} onMarkSkipped={() => void changeEntryState(slot, "skipped")} onMarkRecorded={() => void changeEntryState(slot, "recorded")} />
          )
        }</div>;
      })}</div>}
    {pendingDelete && <div className={styles.deleteBackdrop} onClick={(event) => { if (event.target === event.currentTarget) cancelPendingDelete(); }}>
      <div id="meal-delete-dialog" className={styles.deleteDialog} role="alertdialog" aria-modal="true" aria-labelledby="meal-delete-title" aria-describedby="meal-delete-description">
        <h3 id="meal-delete-title">Delete this {pendingDelete.kind}?</h3>
        <p id="meal-delete-description">{pendingDelete.kind === "meal" ? `This permanently removes ${SLOT_LABELS[pendingDelete.slot].toLowerCase()} and its analysis from your nutrition totals.` : `It will be removed from ${SLOT_LABELS[pendingDelete.slot].toLowerCase()}. Already analyzed photos remain described in the note.`}</p>
        <div className={styles.deleteActions}>
          <button ref={pendingDeleteCancelRef} className={styles.secondaryButton} type="button" onClick={cancelPendingDelete}>Cancel</button>
          <button className={styles.confirmButton} type="button" onClick={() => void confirmPendingDelete()}>Delete</button>
        </div>
      </div>
    </div>}
  </section>;
}

export default MealJournal;
