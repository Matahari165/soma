"use client";

import { useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

import styles from "./meal-journal.module.css";

export type MealsInitialLoadErrorKind = "meals" | "nutrition";

const copy: Record<MealsInitialLoadErrorKind, { title: string; description: string }> = {
  meals: {
    title: "Impossible de charger les repas",
    description: "Les repas de cette journée ne sont pas disponibles pour le moment.",
  },
  nutrition: {
    title: "Historique nutritionnel indisponible",
    description: "Les repas restent disponibles, mais l’historique nutritionnel n’a pas pu être chargé.",
  },
};

export function MealsInitialLoadError({ kind }: { kind: MealsInitialLoadErrorKind }) {
  const [retrying, setRetrying] = useState(false);
  const content = copy[kind];

  const retry = () => {
    if (retrying) return;
    setRetrying(true);
    window.location.reload();
  };

  return <div className={styles.errorState} role="alert">
    <AlertCircle size={18} aria-hidden="true" />
    <div>
      <strong>{content.title}</strong>
      <span>{content.description}</span>
    </div>
    <button className={styles.retryButton} type="button" onClick={retry} disabled={retrying}>
      <RefreshCw size={15} aria-hidden="true" />
      {retrying ? "Rechargement…" : "Réessayer"}
    </button>
  </div>;
}
