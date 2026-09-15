import type {
  CreateMealInput,
  Meal,
  MealAnalysis,
  MealAnalysisCorrection,
  MealAnalysisRecord,
  MealOrigin,
  MealPhoto,
  MealPhotoMime,
  UpdateMealInput,
} from "@/domain/meals";
import { MAX_MEAL_PHOTO_BYTES, MAX_MEAL_PHOTOS, MAX_MEAL_PHOTOS_BYTES, normalizeMealFeeling } from "@/domain/meals";
import type { ConfirmedMealRecord, NutritionEstimate } from "@/domain/lab/meals";
import { MEAL_PLANT_FOOD_GROUPS } from "@/domain/meal-taxonomy";
import { isLocalPreviewMode } from "@/lib/env";
import { previewUser } from "@/lib/local-preview";

type PreviewPhoto = MealPhoto & { data: ArrayBuffer };
type PreviewMeal = Omit<Meal, "photos"> & { photos: PreviewPhoto[] };

const store = new Map<string, Map<string, PreviewMeal>>();
const idempotency = new Map<string, string>();
const localPreviewDemoSeededUsers = new Set<string>();
const LOCAL_PREVIEW_DEMO_LUNCH_ID = "00000000-0000-4000-8000-000000000011";

function userMeals(userId: string) {
  let meals = store.get(userId);
  if (!meals) {
    meals = new Map();
    store.set(userId, meals);
  }
  return meals;
}

function previewDemoLunchDate() {
  return new Date().toISOString().slice(0, 10);
}

function previewDemoQuantity(value: number, unit: string, grams: number) {
  return { value, unit, basis: "portion de démonstration", grams };
}

function previewDemoFoodMetadata(food: MealAnalysis["foods"][number]) {
  const groups = new Set(food.foodGroups ?? []);
  const isPlantFood = [...MEAL_PLANT_FOOD_GROUPS].some((group) => groups.has(group));
  const isFiberSource = isPlantFood || groups.has("nuts_seeds");
  const isProteinSource = groups.has("animal_protein") || groups.has("plant_protein") || groups.has("egg") || groups.has("dairy");
  const properties = [
    isFiberSource ? "fiber_source" as const : null,
    isProteinSource ? "protein_source" as const : null,
    groups.has("nuts_seeds") ? "unsaturated_fat_source" as const : null,
  ].filter((property): property is NonNullable<typeof property> => property !== null);
  const isSweet = groups.has("sweet");
  const isBeverage = groups.has("beverage");
  return {
    alcoholic: false,
    novaGroup: isSweet ? 2 as const : 1 as const,
    sugarExposure: { concentrated: isSweet, liquid: isSweet && isBeverage },
    qualityProperties: properties,
    observation: {
      portion: "observed" as const,
      novaGroup: "observed" as const,
      sugarExposure: "observed" as const,
      qualityProperties: properties.length ? "observed" as const : "none_observed" as const,
      confidence: { portion: "medium" as const, novaGroup: "medium" as const, sugarExposure: "medium" as const, qualityProperties: "medium" as const },
    },
  };
}

function previewDemoAnalysis(): MealAnalysis {
  const range = previewRange;
  return {
    summary: "Déjeuner local de démonstration : poulet grillé, riz basmati et légumes rôtis, salade aux noix, puis yaourt grec aux fruits rouges et miel.",
    dishType: "Plat complet",
    calorieAnalysis: "Estimation illustrative fondée sur les portions indiquées; elle sert uniquement à rendre l’aperçu local exploitable.",
    foods: ([
      { name: "Poulet grillé", preparation: "Grillé", portion: "140 g", estimatedGrams: 140, kind: "ingredient", course: "main", countedInTotals: true, foodGroups: ["animal_protein"], varietyKey: "poulet", evidence: "inferred", evidenceSource: "note", quantity: previewDemoQuantity(140, "g", 140), calories: range(200, 220, 240), proteinGrams: range(36, 40, 44), carbohydrateGrams: range(0, 0, 0), fatGrams: range(6, 7, 9), fiberGrams: range(0, 0, 0), sugarGrams: range(0, 0, 0), addedSugarGrams: range(0, 0, 0), confidence: "medium" },
      { name: "Riz basmati", preparation: "Cuit", portion: "180 g", estimatedGrams: 180, kind: "ingredient", course: "main", countedInTotals: true, foodGroups: ["refined_grain"], varietyKey: "riz-basmati", evidence: "inferred", evidenceSource: "note", quantity: previewDemoQuantity(180, "g cuit", 180), calories: range(190, 210, 230), proteinGrams: range(3, 4, 5), carbohydrateGrams: range(42, 46, 50), fatGrams: range(0, 1, 2), fiberGrams: range(1, 1, 2), sugarGrams: range(0, 0, 0), addedSugarGrams: range(0, 0, 0), confidence: "medium" },
      { name: "Légumes rôtis", preparation: "Courgette, carotte et poivron rôtis", portion: "180 g", estimatedGrams: 180, kind: "ingredient", course: "main", countedInTotals: true, foodGroups: ["vegetable"], varietyKey: "legumes-rotis", evidence: "inferred", evidenceSource: "note", quantity: previewDemoQuantity(180, "g", 180), calories: range(80, 90, 100), proteinGrams: range(2, 3, 4), carbohydrateGrams: range(14, 16, 18), fatGrams: range(1, 2, 3), fiberGrams: range(4, 5, 6), sugarGrams: range(5, 7, 9), addedSugarGrams: range(0, 0, 0), confidence: "medium" },
      { name: "Salade verte", preparation: "Crue", portion: "60 g", estimatedGrams: 60, kind: "ingredient", course: "side", countedInTotals: true, foodGroups: ["vegetable"], varietyKey: "salade-verte", evidence: "inferred", evidenceSource: "note", quantity: previewDemoQuantity(60, "g", 60), calories: range(15, 20, 25), proteinGrams: range(0.5, 1, 1.5), carbohydrateGrams: range(2, 3, 4), fatGrams: range(0, 0, 0), fiberGrams: range(1, 1, 2), sugarGrams: range(0.5, 1, 2), addedSugarGrams: range(0, 0, 0), confidence: "medium" },
      { name: "Noix", preparation: null, portion: "10 g", estimatedGrams: 10, kind: "ingredient", course: "side", countedInTotals: true, foodGroups: ["nuts_seeds"], varietyKey: "noix", evidence: "inferred", evidenceSource: "note", quantity: previewDemoQuantity(10, "g", 10), calories: range(55, 65, 75), proteinGrams: range(1.5, 2, 3), carbohydrateGrams: range(1, 1, 2), fatGrams: range(5, 6, 7), fiberGrams: range(1, 1, 2), sugarGrams: range(0, 0, 1), addedSugarGrams: range(0, 0, 0), confidence: "medium" },
      { name: "Huile d’olive", preparation: "Vinaigrette", portion: "7 g", estimatedGrams: 7, kind: "ingredient", course: "side", countedInTotals: true, foodGroups: ["added_fat"], varietyKey: "huile-olive", evidence: "inferred", evidenceSource: "note", quantity: previewDemoQuantity(7, "g", 7), calories: range(57, 63, 69), proteinGrams: range(0, 0, 0), carbohydrateGrams: range(0, 0, 0), fatGrams: range(6, 7, 8), fiberGrams: range(0, 0, 0), sugarGrams: range(0, 0, 0), addedSugarGrams: range(0, 0, 0), confidence: "medium" },
      { name: "Yaourt grec nature", preparation: null, portion: "100 g", estimatedGrams: 100, kind: "ingredient", course: "dessert", countedInTotals: true, foodGroups: ["dairy"], varietyKey: "yaourt-grec", evidence: "inferred", evidenceSource: "note", quantity: previewDemoQuantity(100, "g", 100), calories: range(85, 95, 105), proteinGrams: range(7, 8, 9), carbohydrateGrams: range(3, 4, 5), fatGrams: range(3, 4, 5), fiberGrams: range(0, 0, 0), sugarGrams: range(3, 4, 5), addedSugarGrams: range(0, 0, 0), confidence: "medium" },
      { name: "Fruits rouges", preparation: "Frais", portion: "80 g", estimatedGrams: 80, kind: "ingredient", course: "dessert", countedInTotals: true, foodGroups: ["fruit"], varietyKey: "fruits-rouges", evidence: "inferred", evidenceSource: "note", quantity: previewDemoQuantity(80, "g", 80), calories: range(25, 35, 45), proteinGrams: range(0, 0.5, 1), carbohydrateGrams: range(6, 8, 10), fatGrams: range(0, 0, 1), fiberGrams: range(2, 3, 4), sugarGrams: range(4, 5, 7), addedSugarGrams: range(0, 0, 0), confidence: "medium" },
      { name: "Miel", preparation: null, portion: "8 g", estimatedGrams: 8, kind: "ingredient", course: "dessert", countedInTotals: true, foodGroups: ["sweet"], varietyKey: "miel", evidence: "inferred", evidenceSource: "note", quantity: previewDemoQuantity(8, "g", 8), calories: range(20, 25, 30), proteinGrams: range(0, 0, 0), carbohydrateGrams: range(5, 6, 8), fatGrams: range(0, 0, 0), fiberGrams: range(0, 0, 0), sugarGrams: range(5, 6, 8), addedSugarGrams: range(5, 6, 8), confidence: "medium" },
    ] as MealAnalysis["foods"]).map((food) => ({ ...food, ...previewDemoFoodMetadata(food) })),
    totals: {
      calories: range(727, 823, 919),
      proteinGrams: range(50, 58.5, 67.5),
      carbohydrateGrams: range(73, 84, 97),
      fatGrams: range(21, 27, 35),
      fiberGrams: range(9, 11, 16),
      sugarGrams: range(17.5, 23, 32),
      addedSugarGrams: range(5, 6, 8),
    },
    confidence: "medium",
    uncertainties: ["Portions et quantité d’huile estimées pour l’aperçu local."],
  };
}

function ensureLocalPreviewDemoMeal(userId: string) {
  if (!isLocalPreviewMode() || userId !== previewUser.id || localPreviewDemoSeededUsers.has(userId)) return;
  localPreviewDemoSeededUsers.add(userId);
  const meals = userMeals(userId);
  const mealDate = previewDemoLunchDate();
  if ([...meals.values()].some((meal) => meal.mealDate === mealDate && meal.mealType === "lunch")) return;
  const now = new Date().toISOString();
  meals.set(LOCAL_PREVIEW_DEMO_LUNCH_ID, {
    id: LOCAL_PREVIEW_DEMO_LUNCH_ID,
    userId,
    mealDate,
    mealType: "lunch",
    entryState: "recorded",
    note: "Déjeuner de démonstration : poulet grillé, riz basmati, légumes rôtis, salade verte aux noix, yaourt grec, fruits rouges et miel.",
    status: "confirmed",
    mouthWarmthIntensity: null,
    stomachOverfullIntensity: null,
    createdAt: now,
    updatedAt: now,
    photos: [],
    analysis: { id: "00000000-0000-4000-8000-000000000012", mealId: LOCAL_PREVIEW_DEMO_LUNCH_ID, status: "completed", provider: "preview", model: "soma-demo-v1", result: previewDemoAnalysis(), error: null, sourcePhotoIds: [], createdAt: now, completedAt: now },
  });
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
    entryState: input.entryState ?? "recorded",
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
  ensureLocalPreviewDemoMeal(userId);
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
  if (input.entryState !== undefined) meal.entryState = input.entryState;
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
    foods: [{ name: describedMeal || "Repas photographié", preparation: null, portion: null, estimatedGrams: null, calories: previewRange(450, 600, 800), proteinGrams: previewRange(18, 28, 40), carbohydrateGrams: previewRange(45, 70, 100), fatGrams: previewRange(12, 20, 32), fiberGrams: previewRange(3, 6, 10), sugarGrams: null, addedSugarGrams: null, confidence: "low", observation: { portion: "unknown", qualityProperties: "unknown", sugarExposure: "unknown", novaGroup: "unknown", confidence: { portion: "low", qualityProperties: "low", sugarExposure: "low", novaGroup: "low" } } }],
    totals: { calories: previewRange(450, 600, 800), proteinGrams: previewRange(18, 28, 40), carbohydrateGrams: previewRange(45, 70, 100), fatGrams: previewRange(12, 20, 32), fiberGrams: previewRange(3, 6, 10), sugarGrams: null, addedSugarGrams: null },
    confidence: "low",
    uncertainties: [],
  };
}

export function analyzePreviewMeal(userId: string, mealId: string, options?: { correction?: MealAnalysisCorrection }) {
  void options;
  const meal = mutablePreviewMeal(userId, mealId);
  if (!meal) return null;
  if (meal.entryState === "skipped") throw new Error("Réactive ce créneau avant de lancer l’analyse.");
  const availablePhotos = meal.photos.filter((photo) => photo.storageStatus !== "purged");
  const note = meal.note?.trim() ?? "";
  if (!availablePhotos.length && !note) throw new Error("Add a photo or a description before analysing a meal.");
  const now = new Date().toISOString();
  const analysis: MealAnalysisRecord = { id: crypto.randomUUID(), mealId, status: "completed", provider: "preview", model: "preview-v1", result: previewAnalysis({ note, hasPhotos: availablePhotos.length > 0 }), error: null, sourcePhotoIds: availablePhotos.map((photo) => photo.id), createdAt: now, completedAt: now };
  meal.analysis = analysis;
  meal.updatedAt = now;
  return { analysis, fresh: true };
}

export function deletePreviewMeal(userId: string, mealId: string) {
  for (const [key, id] of idempotency) if (key.startsWith(`${userId}:`) && id === mealId) idempotency.delete(key);
  return userMeals(userId).delete(mealId);
}

export function clearPreviewUserData(userId: string) {
  if (userId === previewUser.id) localPreviewDemoSeededUsers.add(userId);
  const removed = userMeals(userId).size;
  store.delete(userId);
  for (const [key] of idempotency) if (key.startsWith(`${userId}:`)) idempotency.delete(key);
  return removed;
}

function previewNutrition(value: NutritionEstimate | null | undefined): NutritionEstimate | null {
  return value ? { ...value } : null;
}

type PreviewConfirmedMealFoodWithSugar = NonNullable<ConfirmedMealRecord["foods"]>[number] & {
  sugarG?: NutritionEstimate | null;
  addedSugarG?: NutritionEstimate | null;
};

function previewConfirmedMealFood(food: MealAnalysis["foods"][number]): PreviewConfirmedMealFoodWithSugar {
  return {
    id: food.id,
    name: food.name,
    kind: food.kind,
    parentId: food.parentId,
    portion: food.portion ?? null,
    estimatedGrams: food.estimatedGrams ?? null,
    quantity: food.quantity ?? null,
    sugarG: previewNutrition(food.sugarGrams),
    addedSugarG: previewNutrition(food.addedSugarGrams),
    varietyKey: food.varietyKey ?? null,
    foodGroups: food.foodGroups,
    alcoholic: food.alcoholic,
    novaGroup: food.novaGroup,
    sugarExposure: food.sugarExposure,
    qualityProperties: food.qualityProperties,
    observation: food.observation,
    countedInTotals: food.countedInTotals,
    confidence: food.confidence,
  };
}

export function loadPreviewConfirmedMealRecords(userId: string): ConfirmedMealRecord[] {
  return listPreviewMeals(userId).flatMap((meal) => {
    if (meal.status !== "confirmed") return [];
    const result = meal.analysis?.status === "completed" && meal.analysis.result ? meal.analysis.result : null;
    const origins = new Set(meal.photos.map((photo) => photo.origin));
    const origin = origins.size === 0 ? "unknown" : origins.size === 1 ? [...origins][0] : "mixed";
    const totals = result?.totals;
    return [{ id: meal.id, mealDate: meal.mealDate, mealType: meal.mealType, status: "confirmed" as const, entryState: meal.entryState, origin, caloriesKcal: previewNutrition(totals?.calories), proteinG: previewNutrition(totals?.proteinGrams), carbsG: previewNutrition(totals?.carbohydrateGrams), fatG: previewNutrition(totals?.fatGrams), fiberG: previewNutrition(totals?.fiberGrams), sugarG: previewNutrition(totals?.sugarGrams), addedSugarG: previewNutrition(totals?.addedSugarGrams), foods: result?.foods.map(previewConfirmedMealFood), analysisConfidence: result?.confidence, mouthHeat: meal.mouthWarmthIntensity, stomachOverfullness: meal.stomachOverfullIntensity, photoIds: meal.photos.map((photo) => photo.id) } satisfies ConfirmedMealRecord];
  });
}
