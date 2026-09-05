import type {
  CreateMealInput,
  Meal,
  MealAnalysis,
  MealAnalysisRecord,
  MealOrigin,
  MealPhoto,
  MealPhotoMime,
  UpdateMealInput,
} from "@/domain/meals";
import { MAX_MEAL_PHOTO_BYTES, MAX_MEAL_PHOTOS, MAX_MEAL_PHOTOS_BYTES, normalizeMealFeeling } from "@/domain/meals";
import type { ConfirmedMealRecord, NutritionEstimate } from "@/domain/lab/meals";

type PreviewPhoto = MealPhoto & { data: ArrayBuffer };
type PreviewMeal = Omit<Meal, "photos"> & { photos: PreviewPhoto[] };

const store = new Map<string, Map<string, PreviewMeal>>();
const idempotency = new Map<string, string>();

function userMeals(userId: string) {
  let meals = store.get(userId);
  if (!meals) {
    meals = new Map();
    store.set(userId, meals);
  }
  return meals;
}

function cloneMeal(meal: PreviewMeal): Meal {
  return {
    ...meal,
    photos: meal.photos.map(previewPhotoRecord),
    analysis: meal.analysis ? { ...meal.analysis, sourcePhotoIds: [...meal.analysis.sourcePhotoIds], result: meal.analysis.result ? structuredClone(meal.analysis.result) : null } : null,
  };
}

function previewPhotoRecord(photo: PreviewPhoto): MealPhoto {
  return { id: photo.id, mealId: photo.mealId, origin: photo.origin, objectPath: photo.objectPath, mimeType: photo.mimeType, bytes: photo.bytes, filename: photo.filename ?? null, createdAt: photo.createdAt, storageStatus: photo.storageStatus ?? "available", purgedAt: photo.purgedAt ?? null };
}

export function createPreviewMeal(userId: string, input: CreateMealInput): Meal {
  if (input.status === "confirmed" && !input.note?.trim()) throw new Error("Add photos or a description before confirming a meal.");
  const idempotencyKey = input.idempotencyKey ? `${userId}:${input.idempotencyKey}` : null;
  const existingId = idempotencyKey ? idempotency.get(idempotencyKey) : null;
  const existing = existingId ? userMeals(userId).get(existingId) : null;
  if (existing) return cloneMeal(existing);
  const slotExisting = [...userMeals(userId).values()].find((candidate) => candidate.mealDate === input.mealDate && candidate.mealType === input.mealType);
  if (slotExisting) {
    if (idempotencyKey) idempotency.set(idempotencyKey, slotExisting.id);
    return cloneMeal(slotExisting);
  }
  const now = new Date().toISOString();
  const meal: PreviewMeal = {
    id: crypto.randomUUID(),
    userId,
    mealDate: input.mealDate,
    mealType: input.mealType,
    note: input.note ?? null,
    status: input.status ?? "draft",
    mouthWarmthIntensity: normalizeMealFeeling(input.mouthWarmthIntensity),
    stomachOverfullIntensity: normalizeMealFeeling(input.stomachOverfullIntensity),
    createdAt: now,
    updatedAt: now,
    photos: [],
    analysis: null,
  };
  userMeals(userId).set(meal.id, meal);
  if (idempotencyKey) idempotency.set(idempotencyKey, meal.id);
  return cloneMeal(meal);
}

export function listPreviewMeals(userId: string, options: { from?: string; to?: string } = {}) {
  return [...userMeals(userId).values()]
    .filter((meal) => (!options.from || meal.mealDate >= options.from) && (!options.to || meal.mealDate <= options.to))
    .sort((a, b) => b.mealDate.localeCompare(a.mealDate) || b.createdAt.localeCompare(a.createdAt))
    .map(cloneMeal);
}

export function findPreviewMeal(userId: string, mealId: string) {
  const meal = userMeals(userId).get(mealId);
  return meal ? cloneMeal(meal) : null;
}

function mutablePreviewMeal(userId: string, mealId: string) {
  return userMeals(userId).get(mealId) ?? null;
}

function hasPreservedAnalysis(meal: PreviewMeal, confirmedAnalysis: UpdateMealInput["confirmedAnalysis"]) {
  return Boolean(
    confirmedAnalysis
      ?? (meal.analysis?.status === "completed" && meal.analysis.result ? meal.analysis.result : null)
      ?? (meal.lastSuccessfulAnalysis?.status === "completed" && meal.lastSuccessfulAnalysis.result ? meal.lastSuccessfulAnalysis.result : null),
  );
}

export function updatePreviewMeal(userId: string, mealId: string, input: UpdateMealInput) {
  const meal = mutablePreviewMeal(userId, mealId);
  if (!meal) return null;
  if (input.confirmedAnalysis && input.status !== "confirmed") throw new Error("An edited analysis is saved when the meal is confirmed.");
  if (input.status === "confirmed" && !meal.photos.length && !meal.note?.trim()) throw new Error("Add photos or a description before confirming a meal.");
  const activePhotos = meal.photos.filter((photo) => photo.storageStatus !== "purged");
  if (input.status === "confirmed" && activePhotos.length > 0 && !hasPreservedAnalysis(meal, input.confirmedAnalysis)) throw new Error("Analyse les photos avant de confirmer ce repas.");
  if (input.mealDate !== undefined) meal.mealDate = input.mealDate;
  if (input.mealType !== undefined) meal.mealType = input.mealType;
  if (input.note !== undefined) meal.note = input.note;
  if (input.status !== undefined) meal.status = input.status;
  if (input.mouthWarmthIntensity !== undefined) meal.mouthWarmthIntensity = normalizeMealFeeling(input.mouthWarmthIntensity);
  if (input.stomachOverfullIntensity !== undefined) meal.stomachOverfullIntensity = normalizeMealFeeling(input.stomachOverfullIntensity);
  if (input.confirmedAnalysis) {
    const now = new Date().toISOString();
    meal.analysis = { id: crypto.randomUUID(), mealId, status: "completed", provider: "user", model: "confirmed-v1", result: input.confirmedAnalysis, error: null, sourcePhotoIds: meal.photos.map((photo) => photo.id), createdAt: now, completedAt: now };
  }
  if (input.status === "confirmed") {
    const purgedAt = new Date().toISOString();
    for (const photo of meal.photos) {
      photo.data = new ArrayBuffer(0);
      photo.storageStatus = "purged";
      photo.purgedAt = purgedAt;
    }
  }
  meal.updatedAt = new Date().toISOString();
  return cloneMeal(meal);
}

export function addPreviewMealPhotos(userId: string, mealId: string, files: Array<{ filename?: string | null; mimeType: MealPhotoMime; size: number; data: ArrayBuffer; origin: MealOrigin }>) {
  const meal = mutablePreviewMeal(userId, mealId);
  if (!meal) return null;
  const activePhotoCount = meal.photos.filter((photo) => photo.storageStatus !== "purged").length;
  if (!files.length || activePhotoCount + files.length > MAX_MEAL_PHOTOS) throw new Error(`A meal can contain at most ${MAX_MEAL_PHOTOS} photos.`);
  if (files.some((file) => file.size <= 0 || file.size > MAX_MEAL_PHOTO_BYTES) || files.reduce((total, file) => total + file.size, 0) > MAX_MEAL_PHOTOS_BYTES) throw new Error("The selected photos are too large.");
  const now = new Date().toISOString();
  const photos = files.map((file) => ({ id: crypto.randomUUID(), mealId, origin: file.origin, objectPath: `preview/${userId}/${mealId}/${crypto.randomUUID()}`, mimeType: file.mimeType, bytes: file.size, filename: file.filename ?? null, createdAt: now, storageStatus: "available", purgedAt: null, data: file.data } satisfies PreviewPhoto));
  meal.photos.push(...photos);
  meal.status = "draft";
  meal.updatedAt = now;
  return photos.map(previewPhotoRecord);
}

export function findPreviewPhoto(userId: string, mealId: string, photoId: string) {
  const meal = mutablePreviewMeal(userId, mealId);
  return meal?.photos.find((photo) => photo.id === photoId) ?? null;
}

export function removePreviewPhoto(userId: string, mealId: string, photoId: string) {
  const meal = mutablePreviewMeal(userId, mealId);
  if (!meal) return false;
  const index = meal.photos.findIndex((photo) => photo.id === photoId);
  if (index < 0) return false;
  meal.photos.splice(index, 1);
  meal.status = "draft";
  meal.updatedAt = new Date().toISOString();
  return true;
}

export function updatePreviewPhotoOrigin(userId: string, mealId: string, photoId: string, origin: MealOrigin) {
  const meal = mutablePreviewMeal(userId, mealId);
  const photo = meal?.photos.find((candidate) => candidate.id === photoId);
  if (!meal || !photo) return null;
  photo.origin = origin;
  meal.status = "draft";
  meal.updatedAt = new Date().toISOString();
  return previewPhotoRecord(photo);
}

function previewRange(low: number, likely: number, high: number): NutritionEstimate {
  return { low, likely, high };
}

function previewAnalysis(input: { note: string | null; hasPhotos: boolean }): MealAnalysis {
  const describedMeal = input.note?.trim();
  const sourceLabel = input.hasPhotos && describedMeal
    ? "photos et description"
    : input.hasPhotos
      ? "photos sélectionnées"
      : "description saisie";
  return {
    summary: `Analyse locale de prévisualisation basée sur les ${sourceLabel}.`,
    dishType: null,
    calorieAnalysis: null,
    foods: [{ name: describedMeal || "Repas photographié", preparation: null, portion: null, estimatedGrams: null, calories: previewRange(450, 600, 800), proteinGrams: previewRange(18, 28, 40), carbohydrateGrams: previewRange(45, 70, 100), fatGrams: previewRange(12, 20, 32), fiberGrams: previewRange(3, 6, 10), sugarGrams: null, addedSugarGrams: null, confidence: "low" }],
    totals: { calories: previewRange(450, 600, 800), proteinGrams: previewRange(18, 28, 40), carbohydrateGrams: previewRange(45, 70, 100), fatGrams: previewRange(12, 20, 32), fiberGrams: previewRange(3, 6, 10), sugarGrams: null, addedSugarGrams: null },
    confidence: "low",
    uncertainties: [],
  };
}

export function analyzePreviewMeal(userId: string, mealId: string) {
  const meal = mutablePreviewMeal(userId, mealId);
  if (!meal) return null;
  if (!meal.photos.length && !meal.note?.trim()) throw new Error("Add a photo or a description before analysing a meal.");
  const now = new Date().toISOString();
  const analysis: MealAnalysisRecord = { id: crypto.randomUUID(), mealId, status: "completed", provider: "preview", model: "preview-v1", result: previewAnalysis({ note: meal.note, hasPhotos: meal.photos.length > 0 }), error: null, sourcePhotoIds: meal.photos.map((photo) => photo.id), createdAt: now, completedAt: now };
  meal.analysis = analysis;
  meal.updatedAt = now;
  return { analysis, fresh: true };
}

export function deletePreviewMeal(userId: string, mealId: string) {
  for (const [key, id] of idempotency) if (key.startsWith(`${userId}:`) && id === mealId) idempotency.delete(key);
  return userMeals(userId).delete(mealId);
}

export function clearPreviewUserData(userId: string) {
  const removed = userMeals(userId).size;
  store.delete(userId);
  for (const [key] of idempotency) if (key.startsWith(`${userId}:`)) idempotency.delete(key);
  return removed;
}

function previewNutrition(value: NutritionEstimate | null): NutritionEstimate | null {
  return value ? { ...value } : null;
}

export function loadPreviewConfirmedMealRecords(userId: string): ConfirmedMealRecord[] {
  return listPreviewMeals(userId).flatMap((meal) => {
    if (meal.status !== "confirmed" || meal.analysis?.status !== "completed" || !meal.analysis.result) return [];
    const origins = new Set(meal.photos.map((photo) => photo.origin));
    const origin = origins.size === 0 ? "unknown" : origins.size === 1 ? [...origins][0] : "mixed";
    const totals = meal.analysis.result.totals;
    return [{ id: meal.id, mealDate: meal.mealDate, mealType: meal.mealType, status: "confirmed" as const, origin, caloriesKcal: previewNutrition(totals.calories), proteinG: previewNutrition(totals.proteinGrams), carbsG: previewNutrition(totals.carbohydrateGrams), fatG: previewNutrition(totals.fatGrams), fiberG: previewNutrition(totals.fiberGrams), mouthHeat: meal.mouthWarmthIntensity, stomachOverfullness: meal.stomachOverfullIntensity, photoIds: meal.photos.map((photo) => photo.id) } satisfies ConfirmedMealRecord];
  });
}
