"use client";

import { useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

import styles from "./meal-journal.module.css";

export type MealsInitialLoadErrorKind = "meals" | "nutrition";

const copy: Record<MealsInitialLoadErrorKind, { title: string; description: string }> = {
  meals: {
    title: "Unable to load meals",
    description: "Meals for this day are currently unavailable.",
  },
  nutrition: {
    title: "Nutritional history unavailable",
    description: "Meals remain available, but nutritional history could not be loaded.",
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
      {retrying ? "Reloading…" : "Try again"}
    </button>
  </div>;
}
