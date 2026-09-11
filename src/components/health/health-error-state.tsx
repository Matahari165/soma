"use client";

import { AlertTriangle } from "lucide-react";

import styles from "./health-error-state.module.css";

type HealthRoute = "sleep" | "recovery" | "activity";

const copy: Record<HealthRoute, { title: string; description: string }> = {
  sleep: { title: "Le sommeil est temporairement indisponible", description: "Soma n’a pas pu charger les données de sommeil. Réessayez dans un instant." },
  recovery: { title: "La récupération est temporairement indisponible", description: "Soma n’a pas pu charger les signaux de récupération. Réessayez dans un instant." },
  activity: { title: "L’activité est temporairement indisponible", description: "Soma n’a pas pu charger les données d’activité. Réessayez dans un instant." },
};

export function HealthErrorState({ route, reset }: { route: HealthRoute; reset: () => void }) {
  const routeCopy = copy[route];
  return <main className={styles.root} aria-labelledby="health-error-title"><section className={styles.panel} role="alert"><AlertTriangle size={24} aria-hidden="true" /><div><h1 id="health-error-title">{routeCopy.title}</h1><p>{routeCopy.description}</p><button type="button" onClick={reset}>Réessayer</button></div></section></main>;
}
