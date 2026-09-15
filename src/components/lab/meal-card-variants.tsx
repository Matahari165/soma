"use client";

import { ArrowRight, Camera, ChevronDown, ChevronUp, ImagePlus, Pencil, X } from "lucide-react";
import React, { useRef, useState, type ChangeEvent } from "react";

import type {
  MealRecord,
  MealSlot,
  NutritionRange,
} from "@/domain/meal-record";
import styles from "./meal-card-variants.module.css";

export type MealDesignVariant = "v1" | "v2" | "v3";

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Petit déjeuner",
  lunch: "Déjeuner",
  snack: "Collation",
  dinner: "Dîner",
};

const SLOT_ARTICLES: Record<MealSlot, string> = {
  breakfast: "le",
  lunch: "le",
  dinner: "le",
  snack: "la",
};

export function mealLabelWithArticle(slot: MealSlot): string {
  return `${SLOT_ARTICLES[slot]} ${SLOT_LABELS[slot].toLowerCase()}`;
}

function formatNutritionValue(range: NutritionRange | undefined | null): string {
  if (!range) return "—";
  if (typeof range.likely === "number") return String(Math.round(range.likely));
  if (typeof range.low === "number" && typeof range.high === "number") {
    return String(Math.round((range.low + range.high) / 2));
  }
  if (typeof range.low === "number") return String(Math.round(range.low));
  if (typeof range.high === "number") return String(Math.round(range.high));
  return "—";
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
  return "Repas enregistré";
}

export interface LabMealCardProps {
  meal: MealRecord | null;
  slot: MealSlot;
  saving: boolean;
  processingFiles: boolean;
  mutationBusy: boolean;
  disabled?: boolean;
  designVariant?: MealDesignVariant;
  onFiles: (files: File[]) => void | Promise<void>;
  onRemovePhoto: (photoId: string) => void;
  onAnalyze: () => void;
  onCancelAnalysis: () => void;
  onNote: (note: string) => void;
  onConfirm?: () => void;
  onEdit?: () => void;
  onMarkSkipped?: () => void;
  confirmError?: string | null;
}

export function LabMealCard({
  meal,
  slot,
  saving: _saving,
  processingFiles,
  mutationBusy,
  disabled = false,
  designVariant = "v1",
  onFiles,
  onRemovePhoto,
  onAnalyze,
  onCancelAnalysis,
  onNote,
  onConfirm: _onConfirm,
  onEdit,
  onMarkSkipped: _onMarkSkipped,
  confirmError: _confirmError,
}: LabMealCardProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [isLocalEditing, setIsLocalEditing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const slotLabel = SLOT_LABELS[slot];
  const headingId = `meal-${slot}-title`;
  const inputId = `meal-${slot}-note`;

  const status = meal?.status ?? "draft";
  const isSkipped = meal?.entryState === "skipped";
  const isAnalyzing = status === "analyzing" || status === "accepted";
  const isConfirmedOrReview = status === "confirmed" || status === "review";
  const isFilled = isConfirmedOrReview && Boolean(meal?.analysis) && !isLocalEditing;

  const photos = meal?.status === "confirmed"
    ? []
    : meal?.photos.filter((p) => (p.storageStatus ?? "available") === "available" && Boolean(p.url)) ?? [];
  const purgedPhotoCount = meal?.status === "confirmed"
    ? meal.photos.length
    : meal?.photos.filter((p) => p.storageStatus === "purged" || p.storageStatus === "purge_pending" || !p.url).length ?? 0;
  const hasPhotos = photos.length > 0;
  const noteText = meal?.note ?? "";
  const hasText = noteText.trim().length > 0;
  const canAnalyze = hasPhotos || hasText;
  const isExpanded = isFocused || isLocalEditing || noteText.includes("\n") || noteText.length > 50;

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) {
      void onFiles(files);
    }
    event.target.value = "";
  };

  const handleStartEdit = () => {
    setIsLocalEditing(true);
    if (!meal?.note.trim() && meal?.analysis?.dishType) {
      onNote(meal.analysis.dishType);
    }
    onEdit?.();
  };

  const handleCancelEdit = () => {
    setIsLocalEditing(false);
  };

  const handleAnalyzeClick = () => {
    setIsLocalEditing(false);
    onAnalyze();
  };

  const analysis = meal?.analysis;
  const calValue = formatNutritionValue(analysis?.calories);
  const protValue = formatNutritionValue(analysis?.proteinGrams);
  const carbsValue = formatNutritionValue(analysis?.carbohydratesGrams);
  const fatValue = formatNutritionValue(analysis?.fatGrams);
  const sugarValue = formatNutritionValue(analysis?.addedSugarGrams ?? analysis?.sugarGrams);

  const slotArticle = mealLabelWithArticle(slot);

  // Hidden file inputs
  const fileInputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.visuallyHidden}
        aria-label={`Prendre une photo pour ${slotArticle}`}
        disabled={disabled || processingFiles || mutationBusy}
        onChange={handleFiles}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className={styles.visuallyHidden}
        aria-label={`Choisir des photos pour ${slotArticle}`}
        disabled={disabled || processingFiles || mutationBusy}
        onChange={handleFiles}
      />
    </>
  );

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
            aria-label="Supprimer la photo"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );

  // Analyzing indicator
  if (isAnalyzing) {
    return (
      <article className={styles.cardRoot} aria-labelledby={headingId}>
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <h3 id={headingId} className={styles.slotHeading}>{slotLabel}</h3>
          </div>
        </div>
        <div className={styles.analyzingState} role="status">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className={styles.progressTrace} aria-hidden="true" />
            <span>Analyse en cours…</span>
          </div>
          <button type="button" className={styles.cancelButton} onClick={onCancelAnalysis}>
            Annuler
          </button>
        </div>
      </article>
    );
  }

  // =========================================================================
  // VERSION 1 : HORIZON SILENCIEUX (Ligne épurée borderless)
  // =========================================================================
  if (designVariant === "v1") {
    return (
      <article className={styles.cardRoot} aria-labelledby={headingId}>
        {fileInputs}
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <h3 id={headingId} className={styles.slotHeading}>{slotLabel}</h3>
            {isSkipped && <span className={styles.statusPill}>Pas pris</span>}
          </div>
          {isFilled && (
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.editButton}
                onClick={handleStartEdit}
                aria-label={`Modifier ${slotLabel}`}
              >
                <Pencil size={12} aria-hidden="true" />Modifier
              </button>
            </div>
          )}
        </div>

        {photoStrip}

        {isFilled ? (
          <div className={styles.v1FilledSummary}>
            <p className={styles.v1DishText}>
              {meal?.analysis?.dishType || meal?.note || "Repas enregistré"}
            </p>
            {meal?.analysis?.ingredients && meal.analysis.ingredients.length > 0 && (
              <p className={styles.v1DishSubTitle}>
                {meal.analysis.ingredients.map((i) => i.name).join(" · ")}
              </p>
            )}
            {meal?.note && meal.note !== meal?.analysis?.dishType && (
              <p className={styles.v1DishSubTitle}>Note : {meal.note}</p>
            )}
            {purgedPhotoCount > 0 && <p className={styles.v1DishSubTitle}>Photo analysée puis supprimée.</p>}
            
            <div className={styles.v1NutritionLine} aria-label="Valeurs nutritionnelles">
              <span className={styles.v1MetricItem} aria-label={`Calories : ${calValue} kcal`}>
                <span className={styles.v1MetricLabel}>Calories : </span>
                <span className={styles.v1MetricValue}>{calValue}</span>
                <span className={styles.v1MetricUnit}> kcal</span>
              </span>
              <span className={styles.v1Divider} aria-hidden="true">·</span>
              <span className={styles.v1MetricItem} aria-label={`Protéines : ${protValue} g`}>
                <span className={styles.v1MetricLabel}>Protéines : </span>
                <span className={styles.v1MetricValue}>{protValue}</span>
                <span className={styles.v1MetricUnit}> g</span>
              </span>
              <span className={styles.v1Divider} aria-hidden="true">·</span>
              <span className={styles.v1MetricItem} aria-label={`Glucides : ${carbsValue} g`}>
                <span className={styles.v1MetricLabel}>Glucides : </span>
                <span className={styles.v1MetricValue}>{carbsValue}</span>
                <span className={styles.v1MetricUnit}> g</span>
              </span>
              <span className={styles.v1Divider} aria-hidden="true">·</span>
              <span className={styles.v1MetricItem} aria-label={`Lipides : ${fatValue} g`}>
                <span className={styles.v1MetricLabel}>Lipides : </span>
                <span className={styles.v1MetricValue}>{fatValue}</span>
                <span className={styles.v1MetricUnit}> g</span>
              </span>
              <span className={styles.v1Divider} aria-hidden="true">·</span>
              <span className={styles.v1MetricItem} aria-label={`Sucres ajoutés : ${sugarValue} g`}>
                <span className={styles.v1MetricLabel}>Sucres ajoutés : </span>
                <span className={styles.v1MetricValue}>{sugarValue}</span>
                <span className={styles.v1MetricUnit}> g</span>
              </span>
            </div>

            {meal?.analysis && (
              <div>
                <button 
                  type="button"
                  className={styles.v1DetailsToggle}
                  onClick={() => setShowDetails(!showDetails)}
                  aria-expanded={showDetails}
                >
                  {showDetails ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                  <span>Détails de l’analyse</span>
                </button>
                
                {showDetails && (
                  <div className={styles.v1DetailsPanel}>
                    {meal.analysis.ingredients && meal.analysis.ingredients.length > 0 && (
                      <ul>
                        {meal.analysis.ingredients.map((ing, idx) => (
                          <li key={idx}>
                            {ing.portion ? `${ing.portion} ` : ""}{ing.name}
                          </li>
                        ))}
                      </ul>
                    )}
                    {meal.analysis.calorieAnalysis && (
                      <p>{meal.analysis.calorieAnalysis}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.v1InputRow}>
            <label htmlFor={inputId} className={styles.visuallyHidden}>
              Décrire {slotLabel}
            </label>
            <textarea
              id={inputId}
              className={`${styles.v1TextInput} ${isExpanded ? styles.v1TextInputExpanded : ""}`}
              rows={isExpanded ? 3 : 1}
              placeholder="Décrire le repas…"
              value={noteText}
              disabled={disabled || processingFiles || mutationBusy}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onChange={(e) => onNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && canAnalyze) {
                  e.preventDefault();
                  handleAnalyzeClick();
                }
              }}
            />
            <button
              type="button"
              className={styles.mediaButton}
              aria-label={`Prendre une photo pour ${slotArticle}`}
              disabled={disabled || processingFiles || mutationBusy}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera size={14} aria-hidden="true" />Caméra
            </button>
            <button
              type="button"
              className={styles.mediaButton}
              aria-label={`Choisir des photos pour ${slotArticle}`}
              disabled={disabled || processingFiles || mutationBusy}
              onClick={() => galleryRef.current?.click()}
            >
              <ImagePlus size={14} aria-hidden="true" />Photos
            </button>
            {isLocalEditing && (
              <button
                type="button"
                className={styles.v1CancelBtn}
                disabled={disabled || processingFiles || mutationBusy}
                onClick={handleCancelEdit}
                aria-label="Annuler la modification"
              >
                Annuler
              </button>
            )}
            <button
              type="button"
              className={styles.analyzeButton}
              disabled={!canAnalyze || disabled || processingFiles || mutationBusy}
              onClick={handleAnalyzeClick}
              aria-label={`Analyser ${slotArticle}`}
            >
              <span>Analyser le repas</span>
            </button>
          </div>
        )}
      </article>
    );
  }

  // =========================================================================
  // VERSION 2 : INSTRUMENT FÉDÉRÉ (Bloc unifié instrumental & 5 colonnes)
  // =========================================================================
  if (designVariant === "v2") {
    return (
      <article className={styles.cardRoot} aria-labelledby={headingId}>
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
                onClick={handleStartEdit}
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
            <div className={styles.v2NutritionGrid} aria-label="Indicateurs nutritionnels">
              <div className={styles.v2MetricCell} aria-label={`Calories : ${calValue} kcal`}>
                <span className={styles.v2MetricLabel}>Calories : </span>
                <span className={styles.v2MetricValue}>
                  {calValue}
                  <small> kcal</small>
                </span>
              </div>
              <div className={styles.v2MetricCell} aria-label={`Protéines : ${protValue} g`}>
                <span className={styles.v2MetricLabel}>Protéines : </span>
                <span className={styles.v2MetricValue}>
                  {protValue}
                  <small> g</small>
                </span>
              </div>
              <div className={styles.v2MetricCell} aria-label={`Glucides : ${carbsValue} g`}>
                <span className={styles.v2MetricLabel}>Glucides : </span>
                <span className={styles.v2MetricValue}>
                  {carbsValue}
                  <small> g</small>
                </span>
              </div>
              <div className={styles.v2MetricCell} aria-label={`Lipides : ${fatValue} g`}>
                <span className={styles.v2MetricLabel}>Lipides : </span>
                <span className={styles.v2MetricValue}>
                  {fatValue}
                  <small> g</small>
                </span>
              </div>
              <div className={styles.v2MetricCell} aria-label={`Sucres ajoutés : ${sugarValue} g`}>
                <span className={styles.v2MetricLabel}>Sucres ajoutés : </span>
                <span className={styles.v2MetricValue}>
                  {sugarValue}
                  <small> g</small>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.v2EmptyContainer}>
            <label htmlFor={inputId} className={styles.visuallyHidden}>
              Décrire {slotLabel}
            </label>
            <input
              id={inputId}
              type="text"
              className={styles.v2TextInput}
              placeholder="Décrire le repas…"
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
                  aria-label={`Prendre une photo pour ${slotArticle}`}
                >
                  <Camera size={14} aria-hidden="true" />
                  Caméra
                </button>
                <button
                  type="button"
                  className={styles.mediaPillButton}
                  onClick={() => galleryRef.current?.click()}
                  disabled={disabled || processingFiles || mutationBusy}
                  aria-label={`Choisir des photos pour ${slotArticle}`}
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
                aria-label={`Analyser ${slotArticle}`}
              >
                <span>Analyser le repas</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  // =========================================================================
  // VERSION 3 : MATRICE SPLIT (Asymétrique & focus direct)
  // =========================================================================
  return (
    <article className={styles.cardRoot} aria-labelledby={headingId}>
      {fileInputs}
      <div className={styles.v3Row}>
        <div className={styles.v3SlotSide}>
          <h3 id={headingId} className={styles.v3SlotHeading}>{slotLabel}</h3>
          {isFilled && (
            <button
              type="button"
              className={styles.editButton}
              style={{ width: "fit-content", marginTop: "4px" }}
              onClick={handleStartEdit}
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
              <div className={styles.v3PillsRow} aria-label="Métriques clés">
                <span className={styles.v3Pill} aria-label={`Calories : ${calValue} kcal`}>
                  <span className={styles.v3PillLabel}>Calories : </span>
                  <strong>{calValue}</strong>
                  <small style={{ color: "var(--lab-text-secondary)" }}> kcal</small>
                </span>
                <span className={styles.v3Pill} aria-label={`Protéines : ${protValue} g`}>
                  <span className={styles.v3PillLabel}>Protéines : </span>
                  <strong>{protValue}</strong>
                  <small style={{ color: "var(--lab-text-secondary)" }}> g</small>
                </span>
                <span className={styles.v3Pill} aria-label={`Glucides : ${carbsValue} g`}>
                  <span className={styles.v3PillLabel}>Glucides : </span>
                  <strong>{carbsValue}</strong>
                  <small style={{ color: "var(--lab-text-secondary)" }}> g</small>
                </span>
                <span className={styles.v3Pill} aria-label={`Lipides : ${fatValue} g`}>
                  <span className={styles.v3PillLabel}>Lipides : </span>
                  <strong>{fatValue}</strong>
                  <small style={{ color: "var(--lab-text-secondary)" }}> g</small>
                </span>
                <span className={styles.v3Pill} aria-label={`Sucres ajoutés : ${sugarValue} g`}>
                  <span className={styles.v3PillLabel}>Sucres ajoutés : </span>
                  <strong>{sugarValue}</strong>
                  <small style={{ color: "var(--lab-text-secondary)" }}> g</small>
                </span>
              </div>
            </>
          ) : (
            <div className={styles.v3InputGroup}>
              <label htmlFor={inputId} className={styles.visuallyHidden}>
                Décrire {slotLabel}
              </label>
              <input
                id={inputId}
                type="text"
                className={styles.v3TextInput}
                placeholder="Décrire le repas…"
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
                aria-label={`Prendre une photo pour ${slotArticle}`}
                disabled={disabled || processingFiles || mutationBusy}
                onClick={() => cameraRef.current?.click()}
              >
                <Camera size={14} aria-hidden="true" />Caméra
              </button>
              <button
                type="button"
                className={styles.mediaButton}
                aria-label={`Choisir des photos pour ${slotArticle}`}
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
                aria-label={`Analyser ${slotArticle}`}
              >
                <span>Analyser le repas</span>
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
