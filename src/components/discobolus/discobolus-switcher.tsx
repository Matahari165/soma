"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  DISCOBOLUS_INTENSITIES,
  DISCOBOLUS_INTENSITY_KEY,
  DISCOBOLUS_RENDER_MODES,
  DISCOBOLUS_RENDER_MODE_KEY,
  DISCOBOLUS_STORAGE_KEY,
  DISCOBOLUS_VARIANTS,
  type DiscobolusIntensity,
  type DiscobolusRenderMode,
  type DiscobolusVariant,
} from "./discobolus-types";
import styles from "./discobolus-switcher.module.css";

export interface DiscobolusSwitcherProps {
  readonly variant: DiscobolusVariant;
  readonly intensity: DiscobolusIntensity;
  readonly renderMode?: DiscobolusRenderMode;
  readonly onVariantChange: (variant: DiscobolusVariant) => void;
  readonly onIntensityChange: (intensity: DiscobolusIntensity) => void;
  readonly onRenderModeChange?: (mode: DiscobolusRenderMode) => void;
  readonly initialOpen?: boolean;
}

const emptySubscribe = () => () => {};

export function DiscobolusSwitcher({
  variant,
  intensity,
  renderMode = "hybrid",
  onVariantChange,
  onIntensityChange,
  onRenderModeChange,
  initialOpen = false,
}: DiscobolusSwitcherProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  // Détection d'hydratation / montage sans cascading renders
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Écoute de la touche Échap pour refermer le dock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelectVariant = (nextVariant: DiscobolusVariant) => {
    onVariantChange(nextVariant);
    try {
      localStorage.setItem(DISCOBOLUS_STORAGE_KEY, nextVariant);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  };

  const handleSelectIntensity = (nextIntensity: DiscobolusIntensity) => {
    onIntensityChange(nextIntensity);
    try {
      localStorage.setItem(DISCOBOLUS_INTENSITY_KEY, nextIntensity);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  };

  const handleSelectRenderMode = (nextMode: DiscobolusRenderMode) => {
    onRenderModeChange?.(nextMode);
    try {
      localStorage.setItem(DISCOBOLUS_RENDER_MODE_KEY, nextMode);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  };

  const activeMeta =
    DISCOBOLUS_VARIANTS.find((v) => v.id === variant) ?? DISCOBOLUS_VARIANTS[0];
  const isOff = variant === "off";

  if (!isClient) {
    // Rendu statique / SSR
    return null;
  }

  return (
    <div className={styles.switcherRoot}>
      {!isOpen ? (
        <button
          type="button"
          className={styles.triggerBadge}
          onClick={() => setIsOpen(true)}
          aria-expanded="false"
          aria-label="Ouvrir le sélecteur de statue Discobole"
          title="Configurer la variante artistique d'arrière-plan"
        >
          <span
            className={styles.triggerDot}
            data-active={!isOff}
            aria-hidden="true"
          />
          <span>
            Art: {activeMeta.shortLabel}
            {!isOff && ` · ${intensity}`}
          </span>
          <span className={styles.triggerChevron} aria-hidden="true">
            ▲
          </span>
        </button>
      ) : (
        <section
          className={styles.panel}
          role="region"
          aria-label="Sélecteur d'arrière-plan artistique Discobole"
        >
          <header className={styles.panelHeader}>
            <div className={styles.headerTitleGroup}>
              <h3 className={styles.panelTitle}>Discobolus</h3>
              <span className={styles.previewBadge}>Aperçu</span>
            </div>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
              aria-label="Fermer le sélecteur"
              title="Replier le sélecteur"
            >
              ✕
            </button>
          </header>

          <div>
            <div className={styles.sectionLabel}>Variante artistique</div>
            <div className={styles.variantGrid} role="radiogroup" aria-label="Variantes de la statue">
              {DISCOBOLUS_VARIANTS.map((v) => {
                const isActive = variant === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={styles.variantButton}
                    data-active={isActive}
                    onClick={() => handleSelectVariant(v.id)}
                  >
                    <span className={styles.variantName}>
                      {v.shortLabel}
                      {isActive && <span aria-hidden="true">✓</span>}
                    </span>
                    <span className={styles.variantTagline}>{v.tagline}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={`${styles.intensitySection} ${
              isOff ? styles.intensityDisabled : ""
            }`}
          >
            <div className={styles.sectionLabel}>Densité / Opacité</div>
            <div
              className={styles.intensityRow}
              role="radiogroup"
              aria-label="Opacité de la statue"
            >
              {DISCOBOLUS_INTENSITIES.map((lvl) => {
                const isActive = intensity === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={styles.intensityButton}
                    data-active={isActive}
                    disabled={isOff}
                    onClick={() => handleSelectIntensity(lvl.id)}
                  >
                    {lvl.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={`${styles.intensitySection} ${
              isOff ? styles.intensityDisabled : ""
            }`}
          >
            <div className={styles.sectionLabel}>Technique de rendu</div>
            <div
              className={styles.intensityRow}
              role="radiogroup"
              aria-label="Technique de rendu"
            >
              {DISCOBOLUS_RENDER_MODES.map((m) => {
                const isActive = renderMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={styles.intensityButton}
                    data-active={isActive}
                    disabled={isOff}
                    onClick={() => handleSelectRenderMode(m.id)}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <footer className={styles.panelFooter}>
            <span>URL: ?art={variant}</span>
            <span className={styles.urlHint}>Local storage</span>
          </footer>
        </section>
      )}
    </div>
  );
}
