"use client";

import { ArrowRight, Camera, ChevronDown, ChevronUp, ImagePlus, Pencil, Trash2, X } from "lucide-react";
import React, { useEffect, useRef, useState, type ChangeEvent } from "react";

import type {
  MealRecord,
  MealSlot,
  NutritionRange,
} from "@/domain/meal-record";
import { mealTargetForRange, type NutritionTargets } from "@/domain/nutrition-targets";
import { visibleAnalysisError } from "@/services/meal-client";
import styles from "./meal-card-variants.module.css";

export type MealDesignVariant = "v1" | "v2" | "v3";

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
};

export function mealLabelWithArticle(slot: MealSlot): string {
  return SLOT_LABELS[slot].toLowerCase();
}

function nutritionValue(range: NutritionRange | undefined | null): number | null {
  if (!range) return null;
  if (typeof range.likely === "number" && Number.isFinite(range.likely)) return range.likely;
  if (typeof range.low === "number" && typeof range.high === "number") return (range.low + range.high) / 2;
  if (typeof range.low === "number" && Number.isFinite(range.low)) return range.low;
  if (typeof range.high === "number" && Number.isFinite(range.high)) return range.high;
  return null;
}

function getSummaryText(meal: MealRecord | null): string {
  if (!meal) return "";
  if (meal.analysis?.dishType?.trim()) return meal.analysis.dishType.trim();
  if (meal.note.trim()) return meal.note.trim();
  if (meal.analysis?.ingredients?.length) {
    return meal.analysis.ingredients
      .slice(0, 3)
      .map((i) => i.name)
      .join(", ");
  }
  return "Logged meal";
}

type MealMetricKey = "calories" | "protein" | "carbohydrates" | "fat" | "addedSugar";

type MealMetric = {
  key: MealMetricKey;
  label: string;
  value: number | null;
  unit: string;
};

function mealMetricAccessibleLabel(metric: MealMetric, target: number | null): string {
  const targetWord = metric.key === "addedSugar" ? "limit" : "target";
  if (metric.value === null) return target === null ? `${metric.label}: —` : `${metric.label}: —, ${targetWord} ${formatMetricNumber(target)} ${metric.unit}`;
  const targetLabel = target === null ? "no target assigned" : `${targetWord} ${formatMetricNumber(target)} ${metric.unit}`;
  return `${metric.label}: ${formatMetricNumber(metric.value)} ${metric.unit}, ${targetLabel}`;
}

function formatMetricNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function MealMetrics({ metrics, slot, targets }: { metrics: MealMetric[]; slot: MealSlot; targets?: NutritionTargets }) {
  return (
    <ul className={styles.metricChart} aria-label="Nutritional values and progress per meal">
      {metrics.map((metric) => (
        <li
          key={metric.key}
          className={styles.metricColumn}
          data-metric={metric.key}
          aria-label={mealMetricAccessibleLabel(metric, targets ? mealTargetForMetric(metric.key, slot, targets) : null)}
        >
          {(() => {
            const target = targets ? mealTargetForMetric(metric.key, slot, targets) : null;
            const ratio = metric.value !== null && target !== null && target > 0 ? metric.value / target : 0;
            const progress = Math.min(1, Math.max(0, ratio));
            const targetWord = metric.key === "addedSugar" ? "Limit" : "Target";
            return <>
              <div className={styles.metricPlot} data-target-state={target === null ? "unavailable" : "assigned"} aria-hidden="true">
                {target !== null && <span className={styles.metricPlotTarget} />}
                {target !== null && <span className={styles.metricPlotTrack}><span className={styles.metricPlotFill} data-over-target={ratio > 1 ? "true" : undefined} style={{ transform: `scaleY(${progress})` }} /></span>}
              </div>
              <span className={styles.metricValue}>{formatMetricNumber(metric.value)}<small>{metric.value === null ? "" : ` ${metric.unit}`}</small></span>
              <span className={styles.metricTarget}>{target === null ? `${targetWord} —` : `${targetWord} ${formatMetricNumber(target)} ${metric.unit}`}</span>
              <span className={styles.metricLabel}>{metric.label}</span>
            </>;
          })()}
        </li>
      ))}
    </ul>
  );
}

function mealTargetForMetric(key: MealMetricKey, slot: MealSlot, targets: NutritionTargets): number | null {
  const targetKey = {
    calories: "caloriesKcal",
    protein: "proteinG",
    carbohydrates: "carbsG",
    fat: "fatG",
    addedSugar: "addedSugarG",
  }[key] as keyof Pick<NutritionTargets, "caloriesKcal" | "proteinG" | "fatG" | "carbsG" | "addedSugarG">;
  return mealTargetForRange(targets[targetKey], slot, targets);
}

export function AnalysisDetails({
  meal,
  open,
  detailsId,
  variant,
  onToggle,
  onDeleteMeal,
  mutationBusy,
}: {
  meal: MealRecord;
  open: boolean;
  detailsId: string;
  variant: MealDesignVariant;
  onToggle: () => void;
  onDeleteMeal?: () => void;
  mutationBusy?: boolean;
}) {
  const toggleClass = variant === "v1"
    ? styles.v1DetailsToggle
    : variant === "v2"
      ? styles.v2DetailsToggle
      : styles.v3DetailsToggle;

  return (
    <div className={`${styles.analysisDetails} transition-all duration-300 ease-out`}>
      <button
        type="button"
        className={`${toggleClass} active:scale-[0.98] transition-transform duration-150`}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={detailsId}
      >
        {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        <span>Analysis details</span>
      </button>

      {open && (
        <div id={detailsId} className={`${styles.analysisDetailsPanel} transition-all duration-300 ease-out animate-fade-in`}>
          {meal.analysis?.ingredients && meal.analysis.ingredients.length > 0 && (
            <ul>
              {meal.analysis.ingredients.map((ing, idx) => (
                <li key={ing.id || idx}>
                  {ing.portion ? `${ing.portion} ` : ""}{ing.name}
                </li>
              ))}
            </ul>
          )}
          {meal.note && <p className={styles.analysisDetailsNote}><strong>Day note</strong>{meal.note}</p>}
          {((meal.status === "confirmed" && meal.photos.length > 0) || meal.photos.some((photo) => photo.storageStatus === "purged" || photo.storageStatus === "purge_pending" || !photo.url)) && (
            <p className={styles.analysisDetailsNote}><strong>Photo evidence</strong>Photo analyzed then deleted.</p>
          )}
          {meal.analysis?.calorieAnalysis && <p>{meal.analysis.calorieAnalysis}</p>}
          {onDeleteMeal && (
            <div className="pt-3 mt-3 border-t border-hairline flex justify-end">
              <button
                type="button"
                className="text-xs font-sans text-signal-neg/80 hover:text-signal-neg transition-colors flex items-center gap-1.5 py-1 px-2 rounded hover:bg-signal-neg/10 active:scale-[0.98] transition-transform duration-150"
                disabled={mutationBusy}
                onClick={onDeleteMeal}
              >
                <Trash2 size={13} aria-hidden="true" />
                <span>Delete meal</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface LabMealCardProps {
  meal: MealRecord | null;
  slot: MealSlot;
  saving: boolean;
  processingFiles: boolean;
  mutationBusy: boolean;
  disabled?: boolean;
  designVariant?: MealDesignVariant;
  targets?: NutritionTargets;
  analysisProgress?: { phase?: string; dishType?: string; foods: string[] } | null;
  onFiles: (files: File[]) => void | Promise<void>;
  onRemovePhoto: (photoId: string) => void;
  onPhotoComment?: (photoId: string, comment: string) => void;
  onAnalyze: () => void;
  onCancelAnalysis: () => void;
  onNote: (note: string) => void;
  onCorrection?: (correction: string) => void;
  onConfirm?: () => void;
  onEdit?: () => void;
  onMarkSkipped?: () => void;
  onMarkRecorded?: () => void;
  onDeleteMeal?: () => void;
  confirmError?: string | null;
}

export function LabMealCard({
  meal,
  slot,
  saving,
  processingFiles,
  mutationBusy,
  disabled = false,
  designVariant = "v1",
  targets,
  analysisProgress,
  onFiles,
  onRemovePhoto,
  onPhotoComment,
  onAnalyze,
  onCancelAnalysis,
  onNote,
  onCorrection,
  onConfirm,
  onEdit,
  onMarkSkipped,
  onMarkRecorded,
  onDeleteMeal,
  confirmError,
}: LabMealCardProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [isLocalEditing, setIsLocalEditing] = useState(false);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [correctionText, setCorrectionText] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const autoConfirmMealRef = useRef<string | null>(null);

  const slotLabel = SLOT_LABELS[slot];
  const headingId = `meal-${slot}-title`;
  const inputId = `meal-${slot}-note`;
  const detailsId = `meal-${slot}-analysis-details`;

  const status = meal?.status ?? "draft";
  const isSkipped = meal?.entryState === "skipped";
  const isAnalyzing = status === "analyzing" || status === "accepted";
  const isConfirmedOrReview = status === "confirmed" || status === "review";
  const isFilled = isConfirmedOrReview && Boolean(meal?.analysis) && !isLocalEditing;

  const photos = meal?.status === "confirmed"
    ? []
    : meal?.photos.filter((p) => (p.storageStatus ?? "available") === "available" && Boolean(p.url)) ?? [];
  const hasPhotos = photos.length > 0;
  const noteText = meal?.note ?? "";
  const hasText = noteText.trim().length > 0;
  const canAnalyze = hasPhotos || hasText;
  const confirmRetryAction = status === "review" && meal?.error && onConfirm && (
    <button type="button" className={styles.analyzeButton} disabled={saving || mutationBusy} onClick={onConfirm}>Retry confirmation</button>
  );

  useEffect(() => {
    if (status !== "review" || !meal?.analysis || meal.error) {
      if (status !== "review") autoConfirmMealRef.current = null;
      return;
    }
    if (autoConfirmMealRef.current === meal.id) return;
    autoConfirmMealRef.current = meal.id;
    onConfirm?.();
  }, [meal?.analysis, meal?.error, meal?.id, onConfirm, status]);

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) {
      void onFiles(files);
    }
    event.target.value = "";
  };

  const handleToggleCorrection = () => {
    setIsCorrectionOpen((open) => {
      const next = !open;
      if (!next) setCorrectionText("");
      return next;
    });
    onEdit?.();
  };

  const handleCorrectionSubmit = () => {
    const text = correctionText.trim();
    if (!text) return;
    setIsCorrectionOpen(false);
    setCorrectionText("");
    if (onCorrection) {
      onCorrection(text);
    } else {
      onAnalyze();
    }
  };

  const correctionForm = (
    <div className={styles.correctionBox}>
      <label htmlFor={`meal-${slot}-correction`} className={styles.correctionLabel}>
        Modifier ou ajouter au repas
      </label>
      <textarea
        id={`meal-${slot}-correction`}
        className={styles.correctionTextarea}
        rows={2}
        placeholder="Ex. ajout d’un tiramisu en dessert, café sans sucre..."
        value={correctionText}
        disabled={disabled || mutationBusy || saving || isAnalyzing}
        onChange={(e) => setCorrectionText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleCorrectionSubmit();
          }
        }}
      />
      <div className={styles.correctionActions}>
        <button
          type="button"
          className={styles.correctionSubmitButton}
          disabled={!correctionText.trim() || disabled || mutationBusy || saving || isAnalyzing}
          onClick={handleCorrectionSubmit}
        >
          {isAnalyzing ? "Analyse en cours…" : "Mettre à jour"}
        </button>
        <button
          type="button"
          className={styles.correctionCancelButton}
          disabled={disabled || mutationBusy || saving || isAnalyzing}
          onClick={() => {
            setIsCorrectionOpen(false);
            setCorrectionText("");
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  );

  const handleAnalyzeClick = () => {
    setIsLocalEditing(false);
    onAnalyze();
  };

  const analysis = meal?.analysis;
  const calValue = nutritionValue(analysis?.calories);
  const protValue = nutritionValue(analysis?.proteinGrams);
  const carbsValue = nutritionValue(analysis?.carbohydratesGrams);
  const fatValue = nutritionValue(analysis?.fatGrams);
  const sugarValue = nutritionValue(analysis?.addedSugarGrams);
  const metrics: MealMetric[] = [
    { key: "calories", label: "Calories", value: calValue, unit: "kcal" },
    { key: "protein", label: "Protein", value: protValue, unit: "g" },
    { key: "carbohydrates", label: "Carbohydrates", value: carbsValue, unit: "g" },
    { key: "fat", label: "Fat", value: fatValue, unit: "g" },
    { key: "addedSugar", label: "Added sugar", value: sugarValue, unit: "g" },
  ];

  // Hidden file inputs
  const fileInputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.visuallyHidden}
        aria-label={`Take photo for ${slotLabel}`}
        disabled={disabled || processingFiles || mutationBusy}
        onChange={handleFiles}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className={styles.visuallyHidden}
        aria-label={`Choose photos for ${slotLabel}`}
        disabled={disabled || processingFiles || mutationBusy}
        onChange={handleFiles}
      />
    </>
  );

  if (isSkipped) {
    if (designVariant === "v1") {
      return (
        <article className={`rounded border border-hairline bg-surface-card/60 ${styles.personalLabType}`} aria-labelledby={headingId} aria-busy={saving || mutationBusy} data-purpose={`meal-${slot}-skipped`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 id={headingId} className="font-sans text-xs font-semibold uppercase tracking-wider text-content-primary">{slotLabel}</h3>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-surface-subtle text-content-secondary border border-hairline">Skipped</span>
            </div>
            {onMarkRecorded && (
              <button
                type="button"
                className="px-2.5 py-1 text-xs font-sans text-content-secondary hover:text-content-primary border border-hairline hover:border-hairline-light hover:bg-surface-elevated rounded transition-colors active:scale-[0.98] transition-transform duration-150"
                disabled={disabled || mutationBusy}
                onClick={onMarkRecorded}
              >
                Log this meal
              </button>
            )}
          </div>
          <div className="text-xs text-content-secondary font-sans" role="status" aria-live="polite">
            <strong className="text-content-primary font-medium mr-1.5">Skipped</strong>
            <span>This slot is excluded from meal totals.</span>
          </div>
          {confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}
        </article>
      );
    }

    return (
      <article className={styles.cardRoot} aria-labelledby={headingId} aria-busy={saving || mutationBusy}>
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <h3 id={headingId} className={styles.slotHeading}>{slotLabel}</h3>
            <span className={styles.statusPill}>Skipped</span>
          </div>
        </div>
        <div className={styles.skippedState} role="status" aria-live="polite">
          <div className={styles.skippedCopy}>
            <strong>Skipped</strong>
            <span>This slot is excluded from meal totals.</span>
          </div>
          {onMarkRecorded && <button type="button" className={styles.restoreButton} disabled={disabled || mutationBusy} onClick={onMarkRecorded}>Log this meal</button>}
        </div>
        {confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}
      </article>
    );
  }

  // Photos previews during draft
  const photoStrip = hasPhotos && !isFilled && (
    <div className={styles.photoThumbnails}>
      {photos.map((photo, idx) => (
        <div key={photo.id} className={styles.photoThumb}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={`Photo ${idx + 1}`} />
          <button
            type="button"
            className={styles.photoRemoveBtn}
            onClick={() => onRemovePhoto(photo.id)}
            aria-label="Delete photo"
          >
            <X size={12} />
          </button>
          <label className={styles.photoCommentLabel} htmlFor={`meal-${slot}-photo-${photo.id}-comment`}>Photo {idx + 1} · commentaire facultatif</label>
          <input id={`meal-${slot}-photo-${photo.id}-comment`} className={styles.photoCommentInput} type="text" maxLength={240} value={photo.comment ?? ""} placeholder="Ex. : sauce à part" disabled={mutationBusy || processingFiles} onChange={(event) => onPhotoComment?.(photo.id, event.target.value)} />
        </div>
      ))}
    </div>
  );

  const confirmAction = status === "review" && onConfirm && (
    <button type="button" className={styles.analyzeButton} disabled={saving || mutationBusy} onClick={onConfirm}>Valider le repas</button>
  );

  // Analyzing indicator
  if (isAnalyzing) {
    if (designVariant === "v1") {
      return (
        <article className={`rounded border border-hairline bg-surface-card/60 ${styles.personalLabType}`} aria-labelledby={headingId} aria-busy={saving || processingFiles || mutationBusy} data-purpose={`meal-${slot}-analyzing`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 id={headingId} className="font-sans text-xs font-semibold uppercase tracking-wider text-content-primary">{slotLabel}</h3>
            </div>
            <span className="text-xs font-mono text-content-secondary">
              {analysisProgress?.phase || "Analyse en cours…"}
            </span>
          </div>
          {analysisProgress?.foods && analysisProgress.foods.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {analysisProgress.foods.map((food, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded text-xs font-mono bg-surface-subtle text-content-secondary border border-hairline">{food}</span>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              className="px-2.5 py-1 text-xs font-sans text-content-secondary hover:text-content-primary border border-hairline hover:border-hairline-light hover:bg-surface-elevated rounded transition-colors active:scale-[0.98] transition-transform duration-150"
              onClick={onCancelAnalysis}
            >
              Annuler
            </button>
          </div>
        </article>
      );
    }

    return (
      <article className={styles.cardRoot} aria-labelledby={headingId} aria-busy={saving || processingFiles || mutationBusy}>
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <h3 id={headingId} className={styles.slotHeading}>{slotLabel}</h3>
          </div>
        </div>
        <div className={styles.analyzingState} role="status">
          <div className={styles.analyzingHeader}>
            <span className={styles.progressTrace} aria-hidden="true" />
            <span className={styles.progressPhase}>{analysisProgress?.phase || "Analyse en cours…"}</span>
          </div>
          {analysisProgress?.dishType && (
            <div className={styles.dishBadge}>{analysisProgress.dishType}</div>
          )}
          {analysisProgress?.foods && analysisProgress.foods.length > 0 && (
            <div className={styles.foodChipsList}>
              {analysisProgress.foods.map((food, idx) => (
                <span key={idx} className={styles.foodChip}>{food}</span>
              ))}
            </div>
          )}
          <div className={styles.analyzingActions}>
            <button type="button" className={styles.cancelButton} onClick={onCancelAnalysis}>
              Annuler
            </button>
          </div>
        </div>
      </article>
    );
  }

  if (status === "error") {
    if (designVariant === "v1") {
      return (
        <article className={`rounded border border-hairline bg-surface-card/60 ${styles.personalLabType}`} aria-labelledby={headingId} aria-busy={saving || processingFiles || mutationBusy} data-purpose={`meal-${slot}-error`}>
          {fileInputs}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 id={headingId} className="font-sans text-xs font-semibold uppercase tracking-wider text-content-primary">{slotLabel}</h3>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-surface-subtle text-signal-neg border border-hairline">Error</span>
            </div>
            {!isSkipped && onMarkSkipped && <button type="button" className="min-h-11 min-w-11 px-2 text-xs font-sans text-content-secondary hover:text-content-primary transition-colors" disabled={disabled || mutationBusy} onClick={onMarkSkipped}>Skip</button>}
          </div>
          {photoStrip}
          <div className="space-y-1.5" role="alert">
            <strong className="text-xs font-medium text-signal-neg font-sans block">Analysis interrupted</strong>
            <p className="text-xs text-content-secondary font-sans">{visibleAnalysisError(meal?.error)}</p>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div />
            <button
              type="button"
              className={
                canAnalyze
                  ? "!text-[#050505] !bg-[#f1f1f1] hover:!bg-white font-medium px-3.5 py-1.5 rounded transition-colors text-xs font-sans active:scale-[0.98] transition-transform duration-150"
                  : "!bg-[#161616] !text-[#777777] border border-hairline cursor-not-allowed px-3.5 py-1.5 rounded text-xs font-sans font-medium"
              }
              disabled={!canAnalyze || disabled || processingFiles || mutationBusy}
              onClick={handleAnalyzeClick}
            >
              Retry
            </button>
          </div>
          {confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}
        </article>
      );
    }

    return (
      <article className={styles.cardRoot} aria-labelledby={headingId} aria-busy={saving || processingFiles || mutationBusy}>
        {fileInputs}
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <h3 id={headingId} className={styles.slotHeading}>{slotLabel}</h3>
            <span className={styles.statusPill}>Error</span>
          </div>
        </div>
        {photoStrip}
        <div className={styles.errorState} role="alert">
          <div className={styles.errorCopy}>
            <strong>Analysis interrupted</strong>
            <span>{visibleAnalysisError(meal?.error)}</span>
          </div>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.analyzeButton}
              disabled={!canAnalyze || disabled || processingFiles || mutationBusy}
              onClick={handleAnalyzeClick}
            >
              Retry
            </button>
            {!isSkipped && onMarkSkipped && (
              <button
                type="button"
                className={styles.skipButton}
                disabled={disabled || mutationBusy}
                onClick={onMarkSkipped}
              >
                Skip
              </button>
            )}
          </div>
        </div>
        {confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}
      </article>
    );
  }

  // =========================================================================
  // VERSION 1 : SILENT HORIZON (Clean borderless line)
  // =========================================================================
  // =========================================================================
  // VERSION 1 : SILENT HORIZON / STITCH DASHBOARD
  // =========================================================================
  if (designVariant === "v1") {
    if (isFilled) {
      return (
        <article className={`rounded border border-hairline bg-surface-card/60 animate-fade-in transition-opacity duration-300 ${styles.personalLabType}`} data-purpose={`meal-${slot}`}>
          {fileInputs}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-content-primary">{slotLabel}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-2.5 py-1 text-xs font-sans text-content-primary border border-hairline hover:border-hairline-light hover:bg-surface-elevated rounded transition-colors active:scale-[0.98] transition-transform duration-150"
                onClick={handleToggleCorrection}
                aria-label={`Modifier ${slotLabel}`}
              >
                Modifier
              </button>
            </div>
          </div>
          {photoStrip}
          {confirmAction}
          {meal?.analysis?.ingredients && meal.analysis.ingredients.length > 0 && (
            <p className={`text-xs text-content-tertiary font-mono ${styles.personalLabIngredients}`}>
              {meal.analysis.ingredients.map((i) => i.name).join(" · ")}
            </p>
          )}
          {confirmRetryAction}
          <div className="pt-2 border-t border-hairline flex items-center justify-between text-xs font-mono">
            <span className="text-content-primary font-medium">{calValue !== null ? `${Math.round(calValue)} kcal` : "— kcal"}</span>
            <div className="flex items-center gap-3 text-content-secondary">
              <span>{protValue !== null ? `${Math.round(protValue)}g P` : "—g P"}</span>
              <span>{carbsValue !== null ? `${Math.round(carbsValue)}g C` : "—g C"}</span>
              <span className="text-content-secondary">{sugarValue !== null ? `${Math.round(sugarValue)}g S` : "0g S"}</span>
              <span>{fatValue !== null ? `${Math.round(fatValue)}g F` : "—g F"}</span>
            </div>
          </div>
          <div className="sr-only">
            <MealMetrics metrics={metrics} slot={slot} targets={targets} />
          </div>
          {isCorrectionOpen && correctionForm}
          {meal?.analysis && (
            <AnalysisDetails
              meal={meal}
              open={showDetails}
              detailsId={detailsId}
              variant="v1"
              onToggle={() => setShowDetails((open) => !open)}
              onDeleteMeal={disabled ? undefined : onDeleteMeal}
              mutationBusy={mutationBusy}
            />
          )}
          {confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}
          {meal?.error && <p className={styles.analysisWarning} role="alert">Re-analysis interrupted. The previous analysis is retained. {visibleAnalysisError(meal.error)}</p>}
        </article>
      );
    }

    return (
      <article className={`rounded border border-hairline-light bg-surface-subtle relative ${styles.personalLabType}`} data-purpose={`meal-${slot}-pending`}>
        {fileInputs}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 id={headingId} className="font-sans text-xs font-semibold uppercase tracking-wider text-content-primary">{slotLabel}</h3>
          </div>
          {!isSkipped && onMarkSkipped && <button type="button" className={`${styles.personalLabSkip} min-w-11 px-2 text-xs font-sans text-content-secondary hover:text-content-primary transition-colors`} disabled={disabled || mutationBusy} onClick={onMarkSkipped}>Skip</button>}
        </div>
        {photoStrip}
        <div className="relative">
          <textarea
            id={inputId}
            className="w-full bg-obsidian border border-hairline rounded text-xs text-content-primary placeholder:text-content-secondary focus:outline-none focus:border-hairline-light font-sans"
            rows={1}
            placeholder="Describe this meal or its ingredients…"
            value={noteText}
            disabled={disabled || processingFiles || mutationBusy}
            onChange={(e) => onNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canAnalyze) {
                e.preventDefault();
                handleAnalyzeClick();
              }
            }}
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-2.5 py-1.5 text-xs font-sans text-content-primary border border-hairline hover:border-hairline-light hover:bg-surface-elevated rounded transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-transform duration-150"
              aria-label={`Take photo for ${slotLabel}`}
              disabled={disabled || processingFiles || mutationBusy}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera size={13} aria-hidden="true" />
              Camera
            </button>
            <button
              type="button"
              className="px-2.5 py-1.5 text-xs font-sans text-content-primary border border-hairline hover:border-hairline-light hover:bg-surface-elevated rounded transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-transform duration-150"
              aria-label={`Choose photos for ${slotLabel}`}
              disabled={disabled || processingFiles || mutationBusy}
              onClick={() => galleryRef.current?.click()}
            >
              <ImagePlus size={13} aria-hidden="true" />
              Photos
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={
                canAnalyze
                  ? "!text-[#050505] !bg-[#f1f1f1] hover:!bg-white font-medium px-3.5 py-1.5 rounded transition-colors text-xs font-sans flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform duration-150"
                  : "!bg-[#161616] !text-[#777777] border border-hairline cursor-not-allowed px-3.5 py-1.5 rounded text-xs font-sans font-medium flex items-center gap-1.5"
              }
              disabled={!canAnalyze || disabled || processingFiles || mutationBusy}
              onClick={handleAnalyzeClick}
              aria-label={`Analyze ${slotLabel}`}
            >
              <span>Analyze meal</span>
            </button>
          </div>
        </div>
      </article>
    );
  }

  // =========================================================================
  // VERSION 2 : INSTRUMENT (Unified instrumental block & columns)
  // =========================================================================
  if (designVariant === "v2") {
    return (
      <article className={styles.cardRoot} aria-labelledby={headingId} aria-busy={saving || processingFiles || mutationBusy}>
        {fileInputs}
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <h3 id={headingId} className={styles.slotHeading}>{slotLabel}</h3>
            {!isFilled && !canAnalyze && <span className={styles.v1Divider}>—</span>}
          </div>
          {isFilled && (
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.editButton}
                onClick={handleToggleCorrection}
                aria-label={`Modifier ${slotLabel}`}
              >
                <Pencil size={12} aria-hidden="true" />Modifier
              </button>
            </div>
          )}
        </div>

        {photoStrip}

        {isFilled ? (
          <div className={styles.v2FilledSummary}>
            <p className={styles.v2DishText}>{getSummaryText(meal)}</p>
            {confirmAction}
            <MealMetrics metrics={metrics} slot={slot} targets={targets} />
            {confirmRetryAction}
            {isCorrectionOpen && correctionForm}
            {meal?.analysis && (
              <AnalysisDetails
                meal={meal}
                open={showDetails}
                detailsId={detailsId}
                variant="v2"
                onToggle={() => setShowDetails((open) => !open)}
                onDeleteMeal={disabled ? undefined : onDeleteMeal}
                mutationBusy={mutationBusy}
              />
            )}
            {confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}
            {meal?.error && <p className={styles.analysisWarning} role="alert">Re-analysis interrupted. The previous analysis is retained. {visibleAnalysisError(meal.error)}</p>}
          </div>
        ) : (
          <div className={styles.v2EmptyContainer}>
            <label htmlFor={inputId} className={styles.visuallyHidden}>
              Describe {slotLabel}
            </label>
            <input
              id={inputId}
              type="text"
              className={styles.v2TextInput}
              placeholder="Describe meal…"
              value={noteText}
              disabled={disabled || processingFiles || mutationBusy}
              onChange={(e) => onNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canAnalyze) {
                  e.preventDefault();
                  handleAnalyzeClick();
                }
              }}
            />
            <div className={styles.v2ActionsBar}>
              <div className={styles.v2MediaGroup}>
                <button
                  type="button"
                  className={styles.mediaPillButton}
                  onClick={() => cameraRef.current?.click()}
                  disabled={disabled || processingFiles || mutationBusy}
                  aria-label={`Take photo for ${slotLabel}`}
                >
                  <Camera size={14} aria-hidden="true" />
                  Camera
                </button>
                <button
                  type="button"
                  className={styles.mediaPillButton}
                  onClick={() => galleryRef.current?.click()}
                  disabled={disabled || processingFiles || mutationBusy}
                  aria-label={`Choose photos for ${slotLabel}`}
                >
                  <ImagePlus size={14} aria-hidden="true" />
                  Photos
                </button>
              </div>
              <button
                type="button"
                className={styles.analyzeButton}
                disabled={!canAnalyze || disabled || processingFiles || mutationBusy}
                onClick={handleAnalyzeClick}
                aria-label={`Analyze ${slotLabel}`}
              >
                <span>Analyze meal</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
              {!isSkipped && onMarkSkipped && (
                <button
                  type="button"
                  className={styles.skipButton}
                  disabled={disabled || mutationBusy}
                  onClick={onMarkSkipped}
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        )}
      </article>
    );
  }

  // =========================================================================
  // VERSION 3 : SPLIT MATRIX (Asymmetric & direct focus)
  // =========================================================================
  return (
    <article className={styles.cardRoot} aria-labelledby={headingId} aria-busy={saving || processingFiles || mutationBusy}>
      {fileInputs}
      <div className={styles.v3Row}>
        <div className={styles.v3SlotSide}>
          <h3 id={headingId} className={styles.v3SlotHeading}>{slotLabel}</h3>
          {isFilled && (
            <button
              type="button"
              className={`${styles.editButton} ${styles.v3SlotEditButton}`}
              onClick={handleToggleCorrection}
              aria-label={`Modifier ${slotLabel}`}
            >
              <Pencil size={11} aria-hidden="true" />Modifier
            </button>
          )}
        </div>

        <div className={styles.v3ContentSide}>
          {photoStrip}

          {isFilled ? (
            <>
              <p className={styles.v1DishText}>{getSummaryText(meal)}</p>
              {confirmAction}
              <MealMetrics metrics={metrics} slot={slot} targets={targets} />
              {confirmRetryAction}
              {isCorrectionOpen && correctionForm}
              {meal?.analysis && (
                <AnalysisDetails
                  meal={meal}
                  open={showDetails}
                  detailsId={detailsId}
                  variant="v3"
                  onToggle={() => setShowDetails((open) => !open)}
                  onDeleteMeal={disabled ? undefined : onDeleteMeal}
                  mutationBusy={mutationBusy}
                />
              )}
              {confirmError && <p className={styles.confirmError} role="alert">{confirmError}</p>}
              {meal?.error && <p className={styles.analysisWarning} role="alert">Re-analysis interrupted. The previous analysis is retained. {visibleAnalysisError(meal.error)}</p>}
            </>
          ) : (
            <div className={styles.v3InputGroup}>
              <label htmlFor={inputId} className={styles.visuallyHidden}>
                Describe {slotLabel}
              </label>
              <input
                id={inputId}
                type="text"
                className={styles.v3TextInput}
                placeholder="Describe meal…"
                value={noteText}
                disabled={disabled || processingFiles || mutationBusy}
                onChange={(e) => onNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canAnalyze) {
                    e.preventDefault();
                    handleAnalyzeClick();
                  }
                }}
              />
              <button
                type="button"
                className={styles.mediaButton}
                aria-label={`Take photo for ${slotLabel}`}
                disabled={disabled || processingFiles || mutationBusy}
                onClick={() => cameraRef.current?.click()}
              >
                <Camera size={14} aria-hidden="true" />Camera
              </button>
              <button
                type="button"
                className={styles.mediaButton}
                aria-label={`Choose photos for ${slotLabel}`}
                disabled={disabled || processingFiles || mutationBusy}
                onClick={() => galleryRef.current?.click()}
              >
                <ImagePlus size={14} aria-hidden="true" />Photos
              </button>
              <button
                type="button"
                className={styles.v3CompactAnalyze}
                disabled={!canAnalyze || disabled || processingFiles || mutationBusy}
                onClick={handleAnalyzeClick}
                aria-label={`Analyze ${slotLabel}`}
              >
                <span>Analyze meal</span>
                <ArrowRight size={13} aria-hidden="true" />
              </button>
              {!isSkipped && onMarkSkipped && (
                <button
                  type="button"
                  className={styles.skipButton}
                  disabled={disabled || mutationBusy}
                  onClick={onMarkSkipped}
                >
                  Skip
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
