"use client";

import React from "react";
import {
  DISCOBOLUS_STORAGE_KEY,
  DISCOBOLUS_VARIANTS,
  type DiscobolusVariant,
  normalizeDiscobolusVariant,
} from "./discobolus-types";
import styles from "./discobolus-top-bar.module.css";

export interface DiscobolusTopBarProps {
  readonly variant: DiscobolusVariant;
  readonly onVariantChange: (variant: DiscobolusVariant) => void;
  readonly viewMode?: "main" | "landing";
  readonly onViewModeChange?: (mode: "main" | "landing") => void;
}

export function DiscobolusTopBar({
  variant,
  onVariantChange,
  viewMode,
  onViewModeChange,
}: DiscobolusTopBarProps) {
  const normalizedCurrent = normalizeDiscobolusVariant(variant);

  const handleSelectVariant = (nextVariant: DiscobolusVariant) => {
    onVariantChange(nextVariant);
    try {
      localStorage.setItem(DISCOBOLUS_STORAGE_KEY, nextVariant);
      window.dispatchEvent(
        new CustomEvent("soma-discobolus-change", { detail: { variant: nextVariant } })
      );
    } catch {
      // Ignore storage errors in restricted contexts
    }
  };

  const activeVariants = DISCOBOLUS_VARIANTS.filter((v) => v.id !== "off");
  const offVariant = DISCOBOLUS_VARIANTS.find((v) => v.id === "off");

  return (
    <header className={styles.topBarRoot} role="banner" aria-label="Sélecteur de variantes Discobole">
      <div className={styles.brandGroup}>
        <span className={styles.brandLabel}>Discobole</span>
        <span className={styles.previewPill}>2 Variantes Flanc Gauche</span>
      </div>

      <nav className={styles.variantGroup} aria-label="Déclinaisons artistiques flanc gauche">
        {activeVariants.map((v, index) => {
          const isActive = normalizedCurrent === v.id;
          return (
            <button
              key={v.id}
              type="button"
              className={styles.variantButton}
              data-active={isActive}
              onClick={() => handleSelectVariant(v.id)}
              aria-pressed={isActive}
              title={v.description}
            >
              <span>{index + 1}. {v.shortLabel}</span>
            </button>
          );
        })}
        {offVariant && (
          <button
            type="button"
            className={`${styles.variantButton} ${styles.variantOffButton}`}
            data-active={normalizedCurrent === "off"}
            onClick={() => handleSelectVariant("off")}
            aria-pressed={normalizedCurrent === "off"}
            title="Désactiver la statue sur la page"
          >
            ✕ Off
          </button>
        )}
      </nav>

      {onViewModeChange && viewMode && (
        <div className={styles.viewGroup}>
          <button
            type="button"
            className={styles.viewToggle}
            data-active={viewMode === "main"}
            onClick={() => onViewModeChange("main")}
            title="Afficher la page principale du laboratoire avec la statue latérale"
          >
            🔬 Page Principale
          </button>
          <button
            type="button"
            className={styles.viewToggle}
            data-active={viewMode === "landing"}
            onClick={() => onViewModeChange("landing")}
            title="Afficher l'aperçu de la landing page avec la statue"
          >
            🏛️ Landing Page
          </button>
        </div>
      )}
    </header>
  );
}
