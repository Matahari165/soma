"use client";

import { useMotionPresence } from "@/components/motion/use-motion-presence";
import { useRouter } from "next/navigation";

import {
  AlertCircle,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { MAX_MEAL_PHOTOS, type MealEntryState } from "@/domain/meals";
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
  visibleAnalysisError,
} from "@/services/meal-client";
import { normalizeMealImage } from "@/services/meal-image";
import { LabMealCard, type MealDesignVariant } from "@/components/lab/meal-card-variants";
import { PersonalLabDateStrip } from "@/components/lab/personal-lab-date-strip";
import {
  calorieProgressForDisplay,
  compactDayLabel,
  emptyData,
  emptyMeal,
  firstAvailableMealSlot,
  formatDate,
  groupMealIngredients,
  localDateFor,
  mealHistoryDates,
  mealPhotoLimitMessage,
  mealSlotForLocalTime,
  nextMealPriorityBoundary,
  normalizeData,
  normalizeMeal,
  recordAnalysisToApi,
  shiftIsoDate,
  statusLabel,
  sumLikelyDay,
} from "./meal-journal-logic";
import {
  defaultAnalyze,
  defaultLoad,
  defaultLoadAnalysisStatus,
  defaultRemoveMeal,
  defaultRemovePhoto,
  defaultSave,
  defaultSetEntryState,
  defaultSetPhotoOrigin,
  type MealAnalysisProgress,
} from "./meal-journal-transport";
import {
  LabMealSummary,
  MealCard,
  MealHomeHeader,
  MealLabHeader,
  MealPageHeader,
  MealSourceEvidence,
  MEAL_NOTE_MAX_LENGTH,
  SLOT_LABELS,
} from "./meal-journal-components";
import styles from "./meal-journal.module.css";

export { apiMealToRecord, MEAL_SLOTS, visibleAnalysisError };
export { MealCorrectionPanel, MEAL_NOTE_MAX_LENGTH } from "./meal-journal-components";
export type { MealEntryState } from "@/domain/meals";
export type { MealAnalysisProgress } from "./meal-journal-transport";
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

export {
  calorieProgressForDisplay,
  defaultAnalyze,
  defaultRemoveMeal,
  defaultSave,
  defaultSetEntryState,
  firstAvailableMealSlot,
  groupMealIngredients,
  mealHistoryDates,
  mealPhotoLimitMessage,
  mealSlotForLocalTime,
  recordAnalysisToApi,
};
export type { DayTotal, MealIngredientTree } from "./meal-journal-logic";

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
  initialTargetsPersisted?: boolean;
  initialTargetsFresh?: boolean;
  initialTargetsDate?: string;
  hideAddMealButton?: boolean;
  allowTargetEditing?: boolean;
  showCalorieProgress?: boolean;
  designVariant?: MealDesignVariant;
};

type LoadState = "loading" | "ready" | "error";
type TargetsForDate = { base: NutritionTargets; effective: NutritionTargets; context: EffortTargetContext };

export function reconcileMealJournalData(incoming: MealJournalData, current: MealJournalData | null, previousServer: MealJournalData | null): MealJournalData {
  if (!current || !previousServer || current.date !== incoming.date || previousServer.date !== incoming.date) return incoming;
  const meals = { ...incoming.meals };
  for (const slot of MEAL_SLOTS) {
    if (JSON.stringify(current.meals[slot]) !== JSON.stringify(previousServer.meals[slot])) {
      meals[slot] = current.meals[slot];
    }
  }
  return { ...incoming, meals };
}

export function mergeLocalMealDrafts(loaded: MealJournalData, dateKey: string, cached: MealJournalData["meals"] | undefined, storedNotes: Partial<Record<MealSlot, string>>): MealJournalData {
  const meals = { ...loaded.meals };
  for (const slot of MEAL_SLOTS) {
    const draft = cached?.[slot];
    const hasDraftContent = draft && (draft.note.trim().length > 0 || draft.photos.length > 0);
    if (meals[slot]) {
      if (hasDraftContent && draft.id === meals[slot]?.id) meals[slot] = draft;
      continue;
    }
    if (hasDraftContent) {
      meals[slot] = draft;
      continue;
    }
    const storedNote = (storedNotes[slot] ?? "").slice(0, MEAL_NOTE_MAX_LENGTH);
    if (storedNote.trim()) meals[slot] = { ...emptyMeal(dateKey, slot), note: storedNote };
  }
  return { ...loaded, meals };
}

export function localMealDraftsForStash(meals: MealJournalData["meals"]): MealJournalData["meals"] {
  return Object.fromEntries(MEAL_SLOTS.map((slot) => {
    const meal = meals[slot];
    const keep = meal
      && (meal.status === "draft" || meal.status === "error")
      && (meal.note.trim().length > 0 || meal.photos.length > 0);
    return [slot, keep ? meal : null];
  })) as MealJournalData["meals"];
}

export function MealJournal({ readOnly = false, date, today: providedToday, initialData, api, className, disabledSlots = [], selectedDate: selectedDateProp, onDateChange, showDateNavigation = true, sharedDateNavigation, children, historyDays, variant = "page", publishMealTotals = false, initialTargets, initialEffectiveTargets, initialEffortTargetContext, initialTargetsPersisted, initialTargetsFresh = false, initialTargetsDate, allowTargetEditing, showCalorieProgress = true, designVariant = "v1" }: Props) {
  const router = useRouter();
  const today = providedToday ?? todayInLocalTime();
  const requestedDate = date ?? initialData?.date ?? today;
  const initialDate = requestedDate > today ? today : requestedDate;
  const [internalSelectedDate, setInternalSelectedDate] = useState(initialDate);
  const selectedDate = selectedDateProp ?? internalSelectedDate;
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
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
  const analysisRunIds = useRef<Partial<Record<MealSlot, string>>>({});
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
  type PendingDelete = { kind: "photo"; slot: MealSlot; photoId: string } | { kind: "meal"; slot: MealSlot };
  const [pendingDelete, setPendingDeleteState] = useState<PendingDelete | null>(null);
  const [displayedDelete, setDisplayedDelete] = useState<PendingDelete | null>(null);
  const deletePresent = useMotionPresence(Boolean(pendingDelete));
  const setPendingDelete = useCallback((next: PendingDelete | null) => {
    if (next) setDisplayedDelete(next);
    setPendingDeleteState(next);
  }, []);
  const pendingDeleteTrigger = useRef<HTMLElement | null>(null);
  const pendingDeleteCancelRef = useRef<HTMLButtonElement>(null);
  const objectUrls = useRef(new Set<string>());
  const targetSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetBaseRef = useRef(initialTargets ?? DEFAULT_NUTRITION_TARGETS);
  const effectiveTargetsRef = useRef(initialEffectiveTargets ?? initialTargets ?? DEFAULT_NUTRITION_TARGETS);
  const effortTargetContextRef = useRef<EffortTargetContext>(initialEffortTargetContext ?? { effortScore: null, effortCoverage: null, averageEffortScore: null });
  const targetStatesByDateRef = useRef(new Map<string, TargetsForDate>());
  const targetSelectedDateRef = useRef(selectedDate);
  targetSelectedDateRef.current = selectedDate;
  const targetStateDateRef = useRef(initialTargetsFresh && initialTargets && initialTargetsDate === selectedDate ? selectedDate : null);
  const initialMealSnapshotRef = useRef<MealJournalData | null>(initialData ? normalizeData(initialData, initialDate) : null);
  const initialDataPropRef = useRef(initialData);
  const initialDateRef = useRef(initialDate);
  const activeMealDateRef = useRef(selectedDate);
  const transitionLoadStartedRef = useRef<string | null>(null);
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
    const drafts = localMealDraftsForStash(meals);
    const cached = draftCache.current.get(dateKey);
    for (const slot of MEAL_SLOTS) {
      const meal = meals[slot];
      if (meal && (meal.status === "accepted" || meal.status === "analyzing") && cached?.[slot]) {
        drafts[slot] = { ...cached[slot], id: meal.id };
      }
    }
    if (Object.values(drafts).some((meal) => meal !== null)) draftCache.current.set(dateKey, drafts);
    else draftCache.current.delete(dateKey);
  }, []);

  const updateCachedMealForDate = useCallback((dateKey: string, slot: MealSlot, fallback: MealRecord, update: (meal: MealRecord) => MealRecord) => {
    const meals = draftCache.current.get(dateKey) ?? (dataRef.current?.date === dateKey ? dataRef.current.meals : emptyData(dateKey).meals);
    const nextMeal = update(meals[slot] ?? fallback);
    const drafts = localMealDraftsForStash({ ...meals, [slot]: nextMeal });
    if ((nextMeal.status === "draft" || nextMeal.status === "error") && (nextMeal.note.trim() || nextMeal.photos.length)) drafts[slot] = nextMeal;
    if (Object.values(drafts).some((meal) => meal !== null)) draftCache.current.set(dateKey, drafts);
    else draftCache.current.delete(dateKey);
  }, []);

  const clearCachedMealForDate = useCallback((dateKey: string, slot: MealSlot, mealIds: readonly string[]) => {
    const meals = draftCache.current.get(dateKey);
    if (!meals || !meals[slot] || !mealIds.includes(meals[slot]!.id)) return;
    const nextMeals = { ...meals, [slot]: null };
    if (Object.values(nextMeals).some((meal) => meal !== null)) draftCache.current.set(dateKey, nextMeals);
    else draftCache.current.delete(dateKey);
  }, []);

  const mergeCachedDrafts = useCallback((loaded: MealJournalData, dateKey: string): MealJournalData => {
    const storedNotes = Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, readStoredDraftNote(dateKey, slot)])) as Partial<Record<MealSlot, string>>;
    return mergeLocalMealDrafts(loaded, dateKey, draftCache.current.get(dateKey), storedNotes);
  }, []);

  const goToDate = useCallback((nextDate: string, options: { push?: boolean } = {}) => {
    if (navigationDisabled) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate > today) return;
    if (nextDate === selectedDate) return;
    // The read-only nutrition page calculates every panel from the route date.
    // Let Next render the whole page again instead of changing only the journal.
    if (readOnly && variant === "lab" && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextDate === today) url.searchParams.delete("date");
      else url.searchParams.set("date", nextDate);
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      if (options.push === false) router.replace(nextUrl);
      else router.push(nextUrl);
      return;
    }
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
  }, [navigationDisabled, onDateChange, readOnly, router, selectedDate, selectedDateProp, stashLocalDrafts, today, variant, setPendingDelete]);

  const selectDate = useCallback((nextDate: string) => {
    goToDate(nextDate);
  }, [goToDate]);

  useEffect(() => () => { analysisRunIds.current = {}; }, []);

  const analysisDate = useRef(selectedDate);
  useEffect(() => {
    if (analysisDate.current === selectedDate) return;
    analysisDate.current = selectedDate;
    inFlightSlots.current.clear();
    analysisRunIds.current = {};
    setAnalyzingSlots([]);
    setAnalysisProgress({});
    setSavingSlot(null);
  }, [selectedDate]);

  const preserveActiveMeals = useCallback((incoming: MealJournalData, current: MealJournalData | null) => {
    if (!current || current.date !== incoming.date) return incoming;
    return { ...incoming, meals: { ...incoming.meals, ...Object.fromEntries(
      [...inFlightSlots.current].map((slot) => [slot, current.meals[slot]]),
    ) } };
  }, []);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    const requestDate = selectedDate;
    setLoadState("loading");
    setLoadError(null);
    try {
      const loaded = await (api?.load ? api.load(selectedDate) : defaultLoad(selectedDate));
      if (requestId !== loadRequestId.current || requestDate !== activeMealDateRef.current) return;
      setData((current) => preserveActiveMeals(mergeCachedDrafts(normalizeData(loaded, selectedDate), selectedDate), current));
      setLoadState("ready");
    } catch (error) {
      if (requestId !== loadRequestId.current || requestDate !== activeMealDateRef.current) return;
      setLoadState("error");
      setLoadError(error instanceof Error ? error.message : "Meals are currently unavailable.");
    } finally {
      if (transitionLoadStartedRef.current === requestDate && requestId === loadRequestId.current) {
        transitionLoadStartedRef.current = null;
      }
    }
  }, [api, mergeCachedDrafts, preserveActiveMeals, selectedDate]);

  useEffect(() => {
    const initialDataChanged = initialData !== initialDataPropRef.current;
    if (selectedDateProp === undefined && initialDateRef.current !== initialDate) {
      initialDateRef.current = initialDate;
      loadRequestId.current += 1;
      activeMealDateRef.current = initialDate;
      transitionLoadStartedRef.current = null;
      const current = dataRef.current;
      if (current) stashLocalDrafts(current.date, current.meals);
      setInternalSelectedDate(initialDate);
      const nextServerData = initialData ? normalizeData(initialData, initialDate) : null;
      initialMealSnapshotRef.current = nextServerData;
      setData(nextServerData ? mergeCachedDrafts(nextServerData, initialDate) : null);
      setLoadState(initialData ? "ready" : "loading");
      setLoadError(null);
      setFileError(null);
      setConfirmError({});
      setStatusMessage(null);
      setPendingDelete(null);
      initialDataPropRef.current = initialData;
      return;
    }
    initialDateRef.current = initialDate;
    if (activeMealDateRef.current !== selectedDate) {
      const current = dataRef.current;
      if (current) stashLocalDrafts(current.date, current.meals);
      loadRequestId.current += 1;
      activeMealDateRef.current = selectedDate;
      initialMealSnapshotRef.current = initialMealSnapshotRef.current?.date === selectedDate ? initialMealSnapshotRef.current : null;
      setData(null);
      setFileError(null);
      setConfirmError({});
      setEntryRequest(null);
      setStatusMessage(null);
      setPendingDelete(null);
      setLoadState("loading");
      setLoadError(null);
      transitionLoadStartedRef.current = selectedDate;
      void load();
      initialDataPropRef.current = initialData;
      return;
    }
    if (transitionLoadStartedRef.current === selectedDate && !initialDataChanged) return;
    if (initialData && selectedDate === initialDate && (initialDataChanged || transitionLoadStartedRef.current !== selectedDate)) {
      loadRequestId.current += 1;
      transitionLoadStartedRef.current = null;
      const nextServerData = normalizeData(initialData, selectedDate);
      const mergedData = reconcileMealJournalData(
        nextServerData,
        dataRef.current?.date === selectedDate ? dataRef.current : null,
        initialMealSnapshotRef.current?.date === selectedDate ? initialMealSnapshotRef.current : null,
      );
      initialMealSnapshotRef.current = nextServerData;
      setData((current) => preserveActiveMeals(mergeCachedDrafts(mergedData, selectedDate), current));
      setLoadState("ready");
      initialDataPropRef.current = initialData;
      return;
    }
    initialDataPropRef.current = initialData;
    if (!initialData) initialMealSnapshotRef.current = null;
    const current = dataRef.current;
    if (current && current.date !== selectedDate) stashLocalDrafts(current.date, current.meals);
    void load();
  }, [initialData, initialDate, load, mergeCachedDrafts, preserveActiveMeals, selectedDate, selectedDateProp, stashLocalDrafts, setPendingDelete]);

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
        if (cancelledAnalysisIds.current.has(meal.id) || inFlightSlots.current.has(slot)) return;
        try {
          const body = await defaultLoadAnalysisStatus(meal.id);
          if (cancelled || !body.meal || inFlightSlots.current.has(slot) || cancelledAnalysisIds.current.has(meal.id)) return;
          const next = normalizeMeal(apiMealToRecord(body.meal), selectedDate, slot);
          if (next.status === "accepted" || next.status === "analyzing") setAnalysisProgress((current) => ({ ...current, [slot]: { stage: next.status === "accepted" ? "queued" : "analyzing", phase: next.status === "accepted" ? "En attente de l’analyse…" : "Analyse du repas en cours…", foods: [] } }));
          else setAnalysisProgress((current) => { const nextProgress = { ...current }; delete nextProgress[slot]; return nextProgress; });
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
  }, [pendingDelete, setPendingDelete]);

  const applyLoadedTargets = useCallback((nextBase: NutritionTargets, nextEffective: NutritionTargets, nextContext: EffortTargetContext, targetDate: string) => {
    if (targetDate !== targetSelectedDateRef.current) return;
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
    targetStatesByDateRef.current.set(targetDate, { base: nextBase, effective: merged, context: nextContext });
    setTargets(nextBase);
    setEffectiveTargets(merged);
  }, []);

  const refreshTargets = useCallback(async (signal?: AbortSignal) => {
    if (selectedDate !== targetSelectedDateRef.current || signal?.aborted) return;
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
    if (selectedDate !== targetSelectedDateRef.current || signal?.aborted) return;
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
      if (selectedDate !== targetSelectedDateRef.current || signal?.aborted) return;
      if (!migrated.ok) throw new Error("Local targets could not be synchronized.");
      applyLoadedTargets(localTargets, nutritionTargetsForEffort(localTargets, context), context, selectedDate);
      return;
    }
    applyLoadedTargets(parsed, serverEffective, context, selectedDate);
    saveNutritionTargets(parsed);
  }, [applyLoadedTargets, selectedDate]);

  useEffect(() => {
    const controller = new AbortController();
    const context = initialEffortTargetContext ?? { effortScore: null, effortCoverage: null, averageEffortScore: null };
    const hasFreshTargetsForSelectedDate = initialTargetsFresh && initialTargets && initialTargetsDate === selectedDate;
    if (!hasFreshTargetsForSelectedDate) {
      void refreshTargets(controller.signal).catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setTargetError("Using local targets: Soma synchronization is unavailable.");
      });
    } else {
      const cachedTargets = targetStatesByDateRef.current.get(selectedDate);
      const localTargets = loadNutritionTargets();
      const hasCustomizedLocalTargets = JSON.stringify(localTargets) !== JSON.stringify(DEFAULT_NUTRITION_TARGETS);
      const effectiveContext = cachedTargets?.context ?? context;
      if (cachedTargets) {
        applyLoadedTargets(cachedTargets.base, cachedTargets.effective, cachedTargets.context, selectedDate);
      } else if (initialTargetsPersisted === false && hasCustomizedLocalTargets) {
        applyLoadedTargets(localTargets, nutritionTargetsForEffort(localTargets, effectiveContext), effectiveContext, selectedDate);
      } else {
        const nextEffectiveTargets = initialEffectiveTargets ?? nutritionTargetsForEffort(initialTargets, context);
        applyLoadedTargets(initialTargets, nextEffectiveTargets, context, selectedDate);
        saveNutritionTargets(initialTargets);
      }
      if (initialTargetsPersisted === false && hasCustomizedLocalTargets) {
        void fetch("/api/nutrition-targets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targets: localTargets }),
          signal: controller.signal,
        }).then((response) => {
          if (!response.ok) throw new Error();
          setTargetError(null);
        }).catch((error) => {
          if (error instanceof Error && error.name !== "AbortError") setTargetError("Local targets could not be synchronized.");
        });
      }
    }
    const interval = window.setInterval(() => {
      void refreshTargets().catch(() => undefined);
    }, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [applyLoadedTargets, initialEffectiveTargets, initialEffortTargetContext, initialTargets, initialTargetsDate, initialTargetsFresh, initialTargetsPersisted, refreshTargets, selectedDate]);

  useEffect(() => {
    setMealDistributionDraft(mealTargetDistributionOf(targets));
    setTargetDistributionError(null);
  }, [targets]);

  useEffect(() => () => {
    if (targetSaveTimer.current) clearTimeout(targetSaveTimer.current);
  }, []);

  const currentDayTotal = data?.date === selectedDate ? sumLikelyDay(data.meals) : null;
  const emitMealTotals = useCallback(() => {
    // A loading or failed journal has no new measurement to publish. In
    // particular, it must not erase the calories already rendered by the server.
    if (!publishMealTotals || loadState !== "ready" || data?.date !== selectedDate || typeof window === "undefined") return;
    const calorieTarget = effectiveTargets.caloriesKcal.likely > 0 ? effectiveTargets.caloriesKcal.likely : null;
    const calories = currentDayTotal?.calories ?? null;
    const calorieProgress = calorieProgressForDisplay(calories, calorieTarget ?? 0);
    window.dispatchEvent(new CustomEvent(MEAL_TOTALS_EVENT, {
      detail: { date: selectedDate, isToday: selectedDate === today, calories, calorieTarget, calorieProgress },
    }));
  }, [currentDayTotal?.calories, data?.date, effectiveTargets.caloriesKcal.likely, loadState, publishMealTotals, selectedDate, today]);

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
      targetStatesByDateRef.current.set(targetSelectedDateRef.current, { base: next, effective: nextEffective, context: effortTargetContextRef.current });
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
      targetStatesByDateRef.current.set(targetSelectedDateRef.current, { base: nextTargets, effective: nextEffective, context: effortTargetContextRef.current });
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

  const updateMealOnDate = useCallback((dateKey: string, slot: MealSlot, update: (meal: MealRecord) => MealRecord) => {
    if (selectedDateRef.current !== dateKey) return;
    setData((current) => {
      if (!current || current.date !== dateKey) return current;
      const meal = current.meals[slot] ?? emptyMeal(dateKey, slot);
      return { ...current, meals: { ...current.meals, [slot]: update(meal) } };
    });
  }, []);

  const changeEntryState = async (slot: MealSlot, entryState: MealEntryState) => {
    if (inFlightSlots.current.has(slot)) return;
    const operationDate = selectedDate;
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
      clearCachedMealForDate(operationDate, slot, [current.id, saved.id]);
      if (selectedDateRef.current === operationDate) {
        const nextMeal = normalizeMeal({ ...current, ...saved, entryState }, operationDate, slot);
        setData((loaded) => loaded?.date === operationDate ? { ...loaded, meals: { ...loaded.meals, [slot]: nextMeal } } : loaded);
        setStatusMessage(entryState === "skipped"
          ? `${SLOT_LABELS[slot]} marked as "skipped". This slot will not trigger analysis.`
          : `${SLOT_LABELS[slot]} restored. You can now log details.`);
      }
      return true;
    } catch (error) {
      if (selectedDateRef.current === operationDate) {
        setData((loaded) => loaded?.date === operationDate ? { ...loaded, meals: { ...loaded.meals, [slot]: previous } } : loaded);
        setConfirmError((errors) => ({ ...errors, [slot]: error instanceof Error ? error.message : "The slot status could not be saved." }));
      }
      return false;
    } finally {
      if (selectedDateRef.current === operationDate) {
        inFlightSlots.current.delete(slot);
        setSavingSlot(null);
      }
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
    const operationDate = selectedDate;
    const startingData = dataRef.current?.date === operationDate ? dataRef.current : emptyData(operationDate);
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
      console.info("[meal-analysis] stage", { stage: "normalization", durationMs: Date.now() - normalizationStartedAt });
    } catch (error) {
      console.warn("[meal-analysis] stage failed", { stage: "normalization", durationMs: Date.now() - normalizationStartedAt });
      if (selectedDateRef.current === operationDate) setFileError(error instanceof Error ? error.message : "This photo could not be prepared. Please retake it in JPEG or PNG format.");
      if (selectedDateRef.current === operationDate) {
        setProcessingFiles(false);
        inFlightSlots.current.delete(slot);
      }
      return;
    }
    const targetMeals = dataRef.current?.date === operationDate
      ? dataRef.current.meals
      : draftCache.current.get(operationDate) ?? startingData.meals;
    const currentMeal = targetMeals[slot] ?? emptyMeal(operationDate, slot);
    const activePhotoCount = currentMeal.status === "confirmed" ? 0 : currentMeal.photos.filter((photo) => (photo.storageStatus ?? "available") === "available").length;
    const limitMessage = mealPhotoLimitMessage(activePhotoCount, prepared.length);
    const accepted = prepared.slice(0, Math.max(0, MAX_MEAL_PHOTOS - activePhotoCount));
    if (limitMessage && selectedDateRef.current === operationDate) setFileError(limitMessage);
    const newPhotos = accepted.map((file) => {
      const id = randomId("photo");
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return { id, url, filename: file.name, origin: null } satisfies MealPhoto;
    });
    if (newPhotos.length) {
      setFilesByPhotoId((files) => ({ ...files, ...Object.fromEntries(newPhotos.map((photo, index) => [photo.id, accepted[index]])) }));
      const nextMeal = { ...currentMeal, photos: [...currentMeal.photos, ...newPhotos], status: "draft" as const, error: null };
      if (selectedDateRef.current === operationDate && dataRef.current?.date === operationDate) {
        updateMealOnDate(operationDate, slot, () => nextMeal);
      } else {
        updateCachedMealForDate(operationDate, slot, currentMeal, () => nextMeal);
      }
    }
    if (selectedDateRef.current === operationDate) {
      setProcessingFiles(false);
      inFlightSlots.current.delete(slot);
    }
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
    const operationDate = meal.date;
    inFlightSlots.current.add(pending.slot);
    setSavingSlot(pending.slot);
    let mealDeleted = false;
    try {
      if (pending.kind === "meal") {
        await (api?.removeMeal ? api.removeMeal(meal.id) : defaultRemoveMeal(meal.id));
        clearCachedMealForDate(operationDate, pending.slot, [meal.id]);
        if (selectedDateRef.current === operationDate) {
          setData((current) => current?.date === operationDate ? { ...current, meals: { ...current.meals, [pending.slot]: null } } : current);
          setStatusMessage(`${SLOT_LABELS[pending.slot]} deleted.`);
        }
        mealDeleted = true;
      } else {
        await (api?.removePhoto ? api.removePhoto(meal.id, pending.photoId) : defaultRemovePhoto(meal.id, pending.photoId));
        if (selectedDateRef.current === operationDate) removePhotoFromState(pending.slot, pending.photoId);
        else updateCachedMealForDate(operationDate, pending.slot, meal, (current) => ({
          ...current,
          photos: current.photos.filter((photo) => photo.id !== pending.photoId),
        }));
      }
    } catch (error) {
      const fallback = pending.kind === "meal" ? "This meal could not be deleted." : "This photo could not be deleted.";
      if (selectedDateRef.current === operationDate) setFileError(error instanceof Error ? error.message : fallback);
    } finally {
      if (selectedDateRef.current === operationDate) {
        inFlightSlots.current.delete(pending.slot);
        setSavingSlot(null);
      }
      if (selectedDateRef.current === operationDate && mealDeleted && typeof window !== "undefined") {
        window.requestAnimationFrame(() => document.getElementById(`meal-${pending.slot}-title`)?.focus({ preventScroll: true }));
      } else if (selectedDateRef.current === operationDate) {
        pendingDeleteTrigger.current?.focus();
      }
    }
  };

  const setNote = (slot: MealSlot, note: string) => {
    updateMeal(slot, (current) => ({ ...current, note: note.slice(0, MEAL_NOTE_MAX_LENGTH), status: "draft", error: null }));
  };

  const setPhotoOrigin = async (slot: MealSlot, photoId: string, origin: MealOrigin) => {
    const meal = data?.meals[slot];
    if (!meal) return;
    const operationDate = meal.date;
    updateMeal(slot, (current) => ({
      ...current,
      photos: current.photos.map((photo) => photo.id === photoId ? { ...photo, origin } : photo),
      status: "draft",
      error: null,
    }));
    if (!meal || meal.id.startsWith("meal-") || photoId.startsWith("photo-")) return;
    try {
      if (api?.updatePhotoOrigin) await api.updatePhotoOrigin(meal.id, photoId, origin);
      else await defaultSetPhotoOrigin(meal.id, photoId, origin);
    } catch (error) {
      if (selectedDateRef.current === operationDate) setFileError(error instanceof Error ? error.message : "The photo origin could not be saved.");
    }
  };

  const setPhotoComment = (slot: MealSlot, photoId: string, comment: string) => {
    updateMeal(slot, (current) => ({ ...current, photos: current.photos.map((photo) => photo.id === photoId ? { ...photo, comment: comment.slice(0, 240) } : photo), status: "draft", error: null }));
  };

  const saveMeal = async (meal: MealRecord, status: MealStatus = "confirmed", options: { queued?: boolean; announce?: boolean; shouldApply?: () => boolean } = {}): Promise<boolean> => {
    if (!options.queued && inFlightSlots.current.has(meal.slot)) return false;
    const operationDate = meal.date;
    inFlightSlots.current.add(meal.slot);
    setSavingSlot(meal.slot);
    setConfirmError((previous) => ({ ...previous, [meal.slot]: null }));
    try {
      const saved = await (api?.save ? api.save({ ...meal, status }) : defaultSave({ ...meal, status }));
      if (options.shouldApply && !options.shouldApply()) return true;
      const nextMeal = normalizeMeal({ ...meal, ...saved, note: typeof saved.note === "string" ? saved.note : meal.note, status }, operationDate, meal.slot);
      clearCachedMealForDate(operationDate, meal.slot, [meal.id, saved.id]);
      if (selectedDateRef.current === operationDate) {
        setData((current) => current?.date === operationDate ? { ...current, meals: { ...current.meals, [meal.slot]: nextMeal } } : current);
      }
      if (selectedDateRef.current === operationDate && !options.queued && options.announce !== false && status === "confirmed") {
        setStatusMessage("Meal confirmed. Photo and note can still be updated.");
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            document.getElementById(`meal-${meal.slot}-title`)?.focus({ preventScroll: true });
          });
        }
      }
      return true;
    } catch (error) {
      if ((!options.shouldApply || options.shouldApply()) && selectedDateRef.current === operationDate) {
        setConfirmError((previous) => ({ ...previous, [meal.slot]: error instanceof Error ? error.message : "The meal could not be saved." }));
        updateMealOnDate(operationDate, meal.slot, (current) => ({ ...current, status: current.analysis ? "review" : "draft", error: error instanceof Error ? error.message : "The meal could not be saved." }));
      }
      return false;
    } finally {
      if ((!options.shouldApply || options.shouldApply()) && selectedDateRef.current === operationDate) {
        inFlightSlots.current.delete(meal.slot);
        setSavingSlot(null);
      }
    }
  };

  const analyzeMeal = async (slot: MealSlot, correction?: MealCorrection) => {
    const meal = dataRef.current?.meals[slot];
    if (!meal || inFlightSlots.current.has(slot)) return;
    const operationDate = meal.date;
    if (dataRef.current?.date === operationDate) stashLocalDrafts(operationDate, dataRef.current.meals);
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
    const runId = randomId("run");
    analysisRunIds.current[slot] = runId;
    const isCurrentRun = () => analysisRunIds.current[slot] === runId && selectedDateRef.current === operationDate;
    inFlightSlots.current.add(slot);
    setAnalyzingSlots((previous) => previous.includes(slot) ? previous : [...previous, slot]);
    cancelledAnalysisIds.current.delete(meal.id);
    updateMeal(slot, (current) => ({ ...current, status: "accepted", error: null }));
    setAnalysisProgress((prev) => ({ ...prev, [slot]: { stage: "connecting", phase: "Connexion…", foods: [] } }));
    try {
      let persistedMealId = meal.id;
      const reconcileUploadedPhotos = (pairs: Array<{ localPhotoId: string; photo: MealPhoto }>) => {
        if (cancelledAnalysisIds.current.has(meal.id) || (selectedDateRef.current === operationDate && !isCurrentRun())) return;
        const uploadedByLocalId = new Map(pairs.map((pair) => [pair.localPhotoId, pair.photo]));
        if (selectedDateRef.current !== operationDate) {
          updateCachedMealForDate(operationDate, slot, meal, (current) => ({
            ...current,
            photos: current.photos.map((photo) => uploadedByLocalId.get(photo.id) ?? photo),
          }));
        }
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
        if (selectedDateRef.current !== operationDate) return;
        updateMealOnDate(operationDate, slot, (current) => ({
          ...current,
          photos: current.photos.map((photo) => uploadedByLocalId.get(photo.id) ?? photo),
        }));
      };
      const photoFiles = meal.photos.map((photo) => {
        const file = filesByPhotoId[photo.id];
        return file ? { photoId: photo.id, file } : null;
      }).filter((entry): entry is { photoId: string; file: File } => Boolean(entry));
      const files = photoFiles.map((entry) => entry.file);
      const analyzed = await (api?.analyze ? api.analyze({ date: operationDate, slot, meal, files, photoFiles, ...(correction ? { correction } : {}) }) : defaultAnalyze({ date: operationDate, slot, meal, files, photoFiles, ...(correction ? { correction } : {}) }, {
        onMealCreated: (mealId) => {
          if (cancelledAnalysisIds.current.has(meal.id) || (selectedDateRef.current === operationDate && !isCurrentRun())) return;
          persistedMealId = mealId;
          if (selectedDateRef.current === operationDate) updateMealOnDate(operationDate, slot, (current) => ({ ...current, id: mealId }));
          else updateCachedMealForDate(operationDate, slot, meal, (current) => ({ ...current, id: mealId }));
        },
        onPhotosUploaded: reconcileUploadedPhotos,
        onProgress: (progress) => { if (isCurrentRun()) setAnalysisProgress((prev) => ({ ...prev, [slot]: progress })); },
      }));
      if (cancelledAnalysisIds.current.has(meal.id)) {
        // Annulation demandée pendant l’envoi : le résultat tardif est ignoré
        // et le brouillon local est conservé tel quel.
        return;
      }
      if (selectedDateRef.current === operationDate && !isCurrentRun()) return;
      clearCachedMealForDate(operationDate, slot, [meal.id, persistedMealId]);
      if (!isCurrentRun()) return;
      const nextStatus = analyzed.status === "error" ? "error" : analyzed.status === "accepted" || analyzed.status === "analyzing"
        ? analyzed.status
        : (analyzed.analysis || analyzed.status === "confirmed")
          ? (analyzed.status === "confirmed" ? "confirmed" : "review")
          : "draft";
      const current = dataRef.current?.meals[slot] ?? meal;
      const nextMeal = normalizeMeal({ ...analyzed, note: typeof analyzed.note === "string" && analyzed.note ? analyzed.note : current.note, photos: analyzed.photos?.length ? analyzed.photos : current.photos, status: nextStatus, error: nextStatus === "error" ? analyzed.error : null }, operationDate, slot);
      if (variant === "lab" && nextStatus === "review" && nextMeal.analysis) {
        setAnalysisProgress((previous) => ({ ...previous, [slot]: { stage: "finalizing", phase: "Enregistrement des résultats…", foods: [] } }));
        // Keep the same screen until the existing automatic confirmation completes.
        // Retain the analysis if confirmation fails so it can be saved again.
        const saved = await saveMeal(nextMeal, "confirmed", { queued: true, announce: false, shouldApply: isCurrentRun });
        if (!isCurrentRun()) return;
        if (!saved) updateMeal(slot, (latest) => ({ ...nextMeal, status: "review", error: latest.error }));
      } else {
        updateMeal(slot, () => nextMeal);
      }
    } catch (error) {
      if (!isCurrentRun()) return;
      updateMeal(slot, (current) => ({ ...current, status: current.analysis ? "review" : "error", error: error instanceof Error ? error.message : "Analysis could not be completed." }));
    } finally {
      if (analysisRunIds.current[slot] === runId) {
        delete analysisRunIds.current[slot];
        inFlightSlots.current.delete(slot);
        setAnalyzingSlots((previous) => previous.filter((entry) => entry !== slot));
        setAnalysisProgress((prev) => { const next = {...prev}; delete next[slot]; return next; });
      }
    }
  };

  const cancelAnalysis = (slot: MealSlot) => {
    const meal = dataRef.current?.meals[slot];
    if (!meal || analysisProgress[slot]?.stage === "finalizing") return;
    delete analysisRunIds.current[slot];
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
  const showDatePicker = showDateNavigation && !readOnly && (variant === "lab" || variant === "meals");
  const internalDateNavigation = showDateNavigation && variant === "lab" && readOnly ? (
    <PersonalLabDateStrip
      dates={visibleHistoryDates}
      selectedDate={selectedDate}
      todayDate={today}
      disabled={navigationDisabled}
      ariaLabel="Meal history"
      showDayStatus={false}
      onDateChange={selectDate}
    />
  ) : showDateNavigation ? <>
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
  const labCalories = currentDayTotal?.calories ?? null;
  const labTargetCalories = effectiveTargets?.caloriesKcal?.likely ?? targets?.caloriesKcal?.likely ?? 2400;

  const pageHeader = variant === "home"
    ? <MealHomeHeader />
    : variant === "lab"
    ? <MealLabHeader
        onToggleTargets={targetEditingEnabled ? () => setTargetsExpanded((expanded) => !expanded) : undefined}
        targetsExpanded={targetsExpanded}
        calories={labCalories}
        targetCalories={labTargetCalories}
        showCalorieProgress={showCalorieProgress}
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
      const skipped = meal?.entryState === "skipped";
      return <article className={styles.mealCard} key={slot} aria-labelledby={`meal-${slot}-title`}>
        <header className={styles.readOnlyMealHeader}>
          <h3 id={`meal-${slot}-title`} className={styles.readOnlyMealTitle}>
            {SLOT_LABELS[slot]}
            {skipped && <span className={styles.skippedSlotLabel} role="status">Skipped</span>}
          </h3>
          {meal && !skipped && <MealSourceEvidence meal={meal} inline />}
        </header>
        {skipped ? null : !meal ? <p>No meal logged.</p> : <>
          {(meal.status !== "confirmed" || meal.error) && <p>{statusLabel(meal)}</p>}
          {meal.analysis && <LabMealSummary meal={meal} />}
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
                onMarkSkipped={() => void changeEntryState(slot, "skipped")}
                onMarkRecorded={() => void changeEntryState(slot, "recorded")}
                onDeleteMeal={!disabledSlots.includes(slot) ? () => removeMeal(slot) : undefined}
              />
            </>
          ) : (
            <MealCard meal={meal} slot={slot} priority={priority} compactEmpty={variant !== "page"} labCompact={false} openRequest={entryRequest?.slot === slot ? entryRequest.sequence : undefined} disabled={disabledSlots.includes(slot)} saving={savingSlot === slot} processingFiles={processingFiles} mutationBusy={slotBusy(slot)} confirmError={confirmError[slot]} onFiles={(files) => addFiles(slot, files)} onRemovePhoto={(photoId) => removePhoto(slot, photoId)} onDeleteMeal={() => removeMeal(slot)} onOrigin={(photoId, origin) => void setPhotoOrigin(slot, photoId, origin)} onPhotoComment={(photoId, comment) => setPhotoComment(slot, photoId, comment)} onAnalyze={() => void analyzeMeal(slot)} onCancelAnalysis={() => cancelAnalysis(slot)} onConfirm={() => { if (meal) void saveMeal(meal, "confirmed", { queued: true, announce: false }); }} onCorrection={(correction) => void analyzeMeal(slot, correction)} onRating={(key, value) => setRating(slot, key, value)} onRetry={() => void analyzeMeal(slot)} onNote={(note) => setNote(slot, note)} onMarkSkipped={() => void changeEntryState(slot, "skipped")} onMarkRecorded={() => void changeEntryState(slot, "recorded")} />
          )
        }</div>;
      })}</div>}
    {deletePresent && displayedDelete && <div className={`${styles.deleteBackdrop} soma-motion-overlay`} data-motion-open={Boolean(pendingDelete)} inert={!pendingDelete} aria-hidden={!pendingDelete || undefined} onClick={(event) => { if (event.target === event.currentTarget) cancelPendingDelete(); }}>
      <div id="meal-delete-dialog" className={styles.deleteDialog} role={pendingDelete ? "alertdialog" : undefined} aria-modal={pendingDelete ? true : undefined} aria-labelledby="meal-delete-title" aria-describedby="meal-delete-description">
        <h3 id="meal-delete-title">Delete this {displayedDelete.kind}?</h3>
        <p id="meal-delete-description">{displayedDelete.kind === "meal" ? `This permanently removes ${SLOT_LABELS[displayedDelete.slot].toLowerCase()} and its analysis from your nutrition totals.` : `It will be removed from ${SLOT_LABELS[displayedDelete.slot].toLowerCase()}. Already analyzed photos remain described in the note.`}</p>
        <div className={styles.deleteActions}>
          <button ref={pendingDeleteCancelRef} className={styles.secondaryButton} type="button" onClick={cancelPendingDelete}>Cancel</button>
          <button className={styles.confirmButton} type="button" onClick={() => void confirmPendingDelete()}>Delete</button>
        </div>
      </div>
    </div>}
  </section>;
}

export default MealJournal;
