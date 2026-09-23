import { MAX_MEAL_PHOTOS, type MealFoodCourse } from "@/domain/meals";
import {
  MEAL_SLOTS,
  randomId,
  todayInLocalTime,
  type MealAnalysis,
  type MealIngredient,
  type MealJournalData,
  type MealRecord,
  type MealSlot,
  type NutritionRange,
} from "@/domain/meal-record";

export function formatIngredientLabel(ingredient: MealIngredient) {
  // Keep the quantity in one place. The model can return both a human portion
  // (for example "300 g") and estimatedGrams; displaying both duplicates the
  // same information in the journal.
  const quantity = ingredient.portion.trim() || (typeof ingredient.estimatedGrams === "number" ? `${Math.round(ingredient.estimatedGrams)} g` : "");
  const preparation = ingredient.preparation?.trim() ? ` · ${ingredient.preparation.trim()}` : "";
  return `${ingredient.name.trim()}${quantity ? ` (${quantity})` : ""}${preparation}`;
}

export function mealSlotForLocalTime(value: Date = new Date()): MealSlot | null {
  const hour = value.getHours();
  if (hour >= 6 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour === 16) return "snack";
  if (hour >= 17 && hour < 24) return "dinner";
  return null;
}

export function localDateFor(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

export function nextMealPriorityBoundary(value: Date) {
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

export function mealLabelWithArticle(slot: MealSlot) {
  const labels: Record<MealSlot, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snack",
  };
  return labels[slot].toLowerCase();
}

export function shiftIsoDate(date: string, days: number) {
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

export function ingredientCourse(node: MealIngredientTree, inferUnparentedCourse: boolean): MealFoodCourse | null {
  if (node.ingredient.course) return node.ingredient.course;
  if (node.ingredient.kind === "dish") return "main";
  if (!inferUnparentedCourse) return null;
  return node.ingredient.foodGroups?.some((group) => group === "fruit" || group === "sweet") ? "dessert" : "side";
}

export function groupIngredientSections(nodes: readonly MealIngredientTree[]) {
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

export function ingredientNutritionLabel(ingredient: MealIngredient) {
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

export function normalizedDisplayText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function compactDayLabel(date: string, today?: string) {
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

export function emptyData(date: string): MealJournalData {
  return { date, meals: { breakfast: null, lunch: null, snack: null, dinner: null } };
}

export function emptyMeal(date: string, slot: MealSlot): MealRecord {
  return { id: randomId("meal"), date, slot, photos: [], note: "", analysis: null, mouthHeat: null, stomachLoad: null, status: "draft", entryState: "recorded", error: null, confirmedAt: null };
}

export function firstAvailableMealSlot(meals: MealJournalData["meals"], disabledSlots: readonly MealSlot[] = []) {
  return MEAL_SLOTS.find((slot) => !disabledSlots.includes(slot) && !meals[slot]) ?? null;
}

export function mealPhotoLimitMessage(activePhotoCount: number, incomingPhotoCount: number, maxPhotos = MAX_MEAL_PHOTOS) {
  const available = Math.max(0, maxPhotos - Math.max(0, activePhotoCount));
  const rejected = Math.max(0, incomingPhotoCount - available);
  if (rejected === 0) return null;
  if (available === 0) return `Maximum limit of ${maxPhotos} photos per meal reached. Remove a photo before adding another.`;
  const subject = `${rejected} photo${rejected > 1 ? "s" : ""}`;
  return `Maximum ${maxPhotos} photos per meal. ${subject} ${rejected > 1 ? "were not added" : "was not added"}.`;
}

export function normalizeMeal(raw: MealRecord, date: string, slot: MealSlot): MealRecord {
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

export function normalizeData(raw: MealJournalData, date: string): MealJournalData {
  return {
    date: raw.date || date,
    meals: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, raw.meals?.[slot] ? normalizeMeal(raw.meals[slot] as MealRecord, date, slot) : null])) as MealJournalData["meals"],
  };
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
    summary: analysis.summary?.trim() ? analysis.summary.trim().slice(0, 500) : "Analysis reviewed and confirmed.",
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
      alcoholic: ingredient.alcoholic,
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

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

export function formatRange(range: NutritionRange | undefined, unit: string) {
  if (!range || (range.low === null && range.high === null)) return "—";
  if (range.low === range.high || range.high === null) return `${range.low ?? range.high} ${unit}`;
  if (range.low === null) return `≤ ${range.high} ${unit}`;
  return `${range.low}–${range.high} ${unit}`;
}

export function formatLowHigh(range: NutritionRange | undefined) {
  if (!range || (range.low === null && range.high === null)) return "—";
  return formatRange(range, "").trim();
}

export function likelyOf(range: NutritionRange | undefined): number | null {
  return typeof range?.likely === "number" ? range.likely : null;
}

export function likelyLabel(range: NutritionRange | undefined) {
  const likely = likelyOf(range);
  if (likely !== null) return `${likely}`;
  if (range?.low !== null && range?.low !== undefined) return `${range.low}`;
  if (range?.high !== null && range?.high !== undefined) return `${range.high}`;
  return "—";
}

export type DayTotal = { calories: number | null; protein: number | null; fat: number | null; carbs: number | null; fiber: number | null; addedSugar: number | null };

export function sumLikelyDay(meals: MealJournalData["meals"]): DayTotal | null {
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

export function statusLabel(meal: MealRecord | null) {
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
