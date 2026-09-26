"use client";

/**
 * Presentational building blocks for the meal journal.
 * Data loading and mutation orchestration stay in `meal-journal.tsx`.
 */

import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ImagePlus,
  Pencil,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type AnimationEvent, type ChangeEvent, type KeyboardEvent, type RefObject } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";
import { type MealFoodCourse } from "@/domain/meals";
import {
  type MealAnalysis,
  type MealCorrection,
  type MealOrigin,
  type MealPhoto,
  type MealRecord,
  type MealSlot,
  type NutritionRange,
  type Rating,
} from "@/domain/meal-record";
import { type NutritionTargets } from "@/domain/nutrition-targets";
import { visibleAnalysisError } from "@/services/meal-client";
import {
  calorieProgressForDisplay,
  formatIngredientLabel,
  formatLowHigh,
  groupIngredientSections,
  groupMealIngredients,
  ingredientCourse,
  ingredientNutritionLabel,
  likelyLabel,
  mealLabelWithArticle,
  normalizedDisplayText,
  statusLabel,
  type DayTotal,
  type MealIngredientTree,
} from "./meal-journal-logic";
import styles from "./meal-journal.module.css";

const COURSE_LABELS: Record<MealFoodCourse, string> = {
  starter: "Starter",
  main: "Main course",
  side: "Side",
  dessert: "Dessert",
};

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const ORIGIN_LABELS: Record<MealOrigin, string> = {
  homemade: "Homemade",
  prepared: "Prepared / store-bought",
  mixed: "Mixed",
};

const RATING_LABELS = {
  mouthHeat: "Mouth heat",
  stomachLoad: "Stomach heaviness",
} as const;

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

export const MEAL_NOTE_MAX_LENGTH = 500;

function MealNoteCounter({ id, length, maxLength = MEAL_NOTE_MAX_LENGTH }: { id: string; length: number; maxLength?: number }) {
  const remaining = Math.max(0, maxLength - length);
  return <p id={id} className={styles.noteCounter} aria-live="polite">{length}/{maxLength} · {remaining} remaining</p>;
}

function MealTextInput({ slot, meal, disabled, placeholder = "e.g. 2 bananas and a black coffee.", onNote, onAnalyze }: { slot: MealSlot; meal: MealRecord | null; disabled: boolean; placeholder?: string; onNote: (note: string) => void; onAnalyze?: () => void }) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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

export function LabMealSummary({ meal }: { meal: MealRecord }) {
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
export function MealSourceEvidence({ meal, inline = false }: { meal: MealRecord; inline?: boolean }) {
  const photos = meal.status === "confirmed"
    ? []
    : meal.photos.filter((photo) => (photo.storageStatus ?? "available") === "available" && Boolean(photo.url));
  const purgedPhotoCount = meal.status === "confirmed"
    ? meal.photos.length
    : meal.photos.filter((photo) => photo.storageStatus === "purged" || photo.storageStatus === "purge_pending" || !photo.url).length;
  const note = meal.note.trim();
  if (!photos.length && !note && purgedPhotoCount === 0) return null;
  return <details className={`${styles.sourceDetails} ${inline ? styles.sourceDetailsInline : ""}`}>
    {inline
      ? <summary aria-label={`Photos and notes for ${SLOT_LABELS[meal.slot]}`}><ChevronDown size={16} aria-hidden="true" /></summary>
      : <summary>Photo and note of the day</summary>}
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

export function MealCard({ meal, slot, saving, processingFiles, mutationBusy, disabled = false, compactEmpty = false, labCompact = false, mealsCompact = false, priority = false, openRequest, onFiles, onRemovePhoto, onDeleteMeal, onOrigin, onPhotoComment, onAnalyze, onCancelAnalysis, onConfirm, onRating, onRetry, onNote, onCorrection, onMarkSkipped, onMarkRecorded, confirmError }: {
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
  const completed = Boolean(meal?.analysis && !meal.error && status === "confirmed");
  const [correctionMode, setCorrectionMode] = useState(false);
  const [ratingSaveState, setRatingSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [analysisChoice, setAnalysisChoice] = useState<{ status: string; open: boolean } | null>(null);
  const previousFeedback = useRef({ status, analysis: meal?.analysis ?? null, completed });
  const analysisArrivalRef = useRef<HTMLDivElement | null>(null);
  const confirmationRef = useRef<SVGSVGElement | null>(null);
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
  useEffect(() => {
    if (status !== "review" || !meal?.analysis || meal.error) {
      if (status !== "review") autoConfirmMealRef.current = null;
      return;
    }
    if (autoConfirmMealRef.current === meal.id) return;
    autoConfirmMealRef.current = meal.id;
    onConfirm();
  }, [meal?.analysis, meal?.error, meal?.id, onConfirm, status]);

  useEffect(() => {
    const previous = previousFeedback.current;
    const wasAnalyzing = previous.status === "accepted" || previous.status === "analyzing";
    const receivedNewAnalysis = wasAnalyzing
      && (status === "review" || status === "confirmed")
      && Boolean(meal?.analysis)
      && previous.analysis !== meal?.analysis
      && !meal?.error;

    if (receivedNewAnalysis && analysisArrivalRef.current) analysisArrivalRef.current.classList.add(styles.analysisResultArrival);
    if (completed && !previous.completed && confirmationRef.current) confirmationRef.current.classList.add(styles.confirmationCheckArrival);
    previousFeedback.current = { status, analysis: meal?.analysis ?? null, completed };
  }, [completed, meal?.analysis, meal?.error, status]);

  return <article className={`${styles.mealCard} ${!meal ? styles.mealCardEmpty : ""} ${completed ? styles.mealCardConfirmed : ""} ${priority ? styles.mealCardPriority : ""}`} aria-labelledby={headingId} aria-busy={saving || processingFiles || status === "accepted" || status === "analyzing"}>
    <header className={styles.mealHeader}>
      <div className={styles.mealTitle}><h3 id={headingId} tabIndex={-1}>{SLOT_LABELS[slot]}</h3></div>
      {labCompact ? <div className={styles.labHeaderActions}>
        {meal && visibleStatus ? <span className={styles.mealStatus} data-status={skipped ? "skipped" : meal.error ? "error" : completed ? "confirmed" : meal.status}>{completed && !skipped ? <Check ref={confirmationRef} size={14} aria-hidden="true" onAnimationEnd={(event: AnimationEvent<SVGSVGElement>) => event.currentTarget.classList.remove(styles.confirmationCheckArrival)} /> : null}{visibleStatus}</span> : null}
        {meal?.analysis && !skipped && (status === "review" || status === "confirmed") ? <MealCompletionControls mutationBusy={mutationBusy} onConfirm={onConfirm} retryable={Boolean(meal.error)} onEdit={() => { setCorrectionMode(true); setAnalysisOpen(true); }} /> : null}
        {!skipped && status === "draft" ? <button className={styles.mealHeaderSkip} type="button" disabled={mutationBusy} onClick={onMarkSkipped}>Skip</button> : null}
      </div> : mealsCompact ? <div className={styles.mealHeaderMeta}>
        {meal?.analysis && !skipped && <span className={styles.mealCalories}>{likelyLabel(meal.analysis.calories)} kcal</span>}
        {visibleStatus && <span className={styles.mealStatus} data-status={skipped ? "skipped" : meal?.error ? "error" : completed ? "confirmed" : meal?.status ?? "empty"}>{completed && !skipped ? <Check ref={confirmationRef} size={14} aria-hidden="true" onAnimationEnd={(event: AnimationEvent<SVGSVGElement>) => event.currentTarget.classList.remove(styles.confirmationCheckArrival)} /> : null}{visibleStatus}</span>}
      </div> : visibleStatus && <span className={styles.mealStatus} data-status={skipped ? "skipped" : meal?.error ? "error" : completed ? "confirmed" : meal?.status ?? "empty"}>{completed && !skipped ? <Check ref={confirmationRef} size={14} aria-hidden="true" onAnimationEnd={(event: AnimationEvent<SVGSVGElement>) => event.currentTarget.classList.remove(styles.confirmationCheckArrival)} /> : null}{visibleStatus}</span>}
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
    {!inactive && (status === "accepted" || status === "analyzing") && <div className={styles.analyzingState} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.analysisProgressCopy}><strong>{status === "accepted" ? "Analysis queued" : "Analyzing…"}</strong><span>{status === "accepted" ? "It will continue in the background." : "Reading the meal details and estimating nutrients."}</span></div>
      <ol className={styles.mealAnalysisSteps} aria-label="Analysis progress">
        {(["Queued", "Analysis", "Results"] as const).map((step, index) => {
          const activeStep = status === "accepted" ? 0 : 1;
          return <li key={step} data-state={index < activeStep ? "complete" : index === activeStep ? "active" : "upcoming"} aria-current={index === activeStep ? "step" : undefined}><span aria-hidden="true">0{index + 1}</span>{step}</li>;
        })}
      </ol>
      <button className={styles.secondaryButton} type="button" onClick={onCancelAnalysis}>Cancel</button>
    </div>}
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
        <div ref={analysisArrivalRef} onAnimationEnd={(event) => { if (event.target === event.currentTarget) event.currentTarget.classList.remove(styles.analysisResultArrival); }}>
          {mealsCompact ? <MealsMealSummary meal={meal} /> : labCompact ? <LabMealSummary meal={meal} /> : <AnalysisSummary meal={meal} />}
        </div>
        {status === "review" && saving && !meal.error && <p className={styles.confirmationPending} role="status" aria-live="polite">Saving meal…</p>}
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

export function MealPageHeader({ totals, targets, mealsVariant = false, targetsExpanded = false, onToggleTargets }: { totals: DayTotal | null; targets: NutritionTargets; mealsVariant?: boolean; targetsExpanded?: boolean; onToggleTargets?: () => void }) {
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

export function MealHomeHeader() {
  return <header className={styles.homeHeader}>
    <div><span className={styles.eyebrow}>Daily journal</span><h2 id="meal-journal-title">Nutrition</h2></div>
  </header>;
}

export function MealLabHeader({
  onToggleTargets,
  targetsExpanded = false,
  calories = null,
  targetCalories = 2400,
  showCalorieProgress = true,
}: {
  onToggleTargets?: () => void;
  targetsExpanded?: boolean;
  calories?: number | null;
  targetCalories?: number | null;
  showCalorieProgress?: boolean;
}) {
  const targetVal = targetCalories ?? 2400;
  const calPct = calorieProgressForDisplay(calories ?? null, targetVal);
  return (
    <header className="pb-4 border-b border-hairline space-y-2.5">
      <div className="flex flex-row items-center justify-between gap-3">
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
      {showCalorieProgress && <div
        className={`w-full h-2 rounded-full overflow-hidden bg-hairline-light border ${calPct === null ? "border-dashed border-hairline opacity-70" : "border-hairline"}`}
        {...(calPct === null
          ? { role: "img", "aria-label": "Calorie target progress: Calories unavailable" }
          : { role: "progressbar", "aria-label": "Calorie target progress", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": calPct, "aria-valuetext": `${calPct}% of calorie target` })}
        data-state={calPct === null ? "unavailable" : "available"}
      >
        {calPct !== null && <div className="h-full bg-sage rounded-full transition-bar" style={{ width: `${calPct}%` }} />}
      </div>}
    </header>
  );
}
