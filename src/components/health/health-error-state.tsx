"use client";

import { useEffect, useRef } from "react";

import { AlertTriangle } from "lucide-react";

import observatoryStyles from "./health-observatory.module.css";
import styles from "./health-error-state.module.css";

type HealthRoute = "sleep" | "recovery" | "activity";

const copy: Record<HealthRoute, { title: string; description: string }> = {
  sleep: { title: "Le sommeil est temporairement indisponible", description: "Soma n’a pas pu charger les données de sommeil. Les sections déjà affichées sont conservées. Réessayez pour la partie manquante." },
  recovery: { title: "La récupération est temporairement indisponible", description: "Soma n’a pas pu charger les signaux de récupération. Les sections déjà affichées sont conservées. Réessayez pour la partie manquante." },
  activity: { title: "L’activité est temporairement indisponible", description: "Soma n’a pas pu charger les données d’activité. Les sections déjà affichées sont conservées. Réessayez pour la partie manquante." },
};

export function HealthErrorState({ route, reset }: { route: HealthRoute; reset: () => void }) {
  const routeCopy = copy[route];
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  return <section className={`${styles.root} ${observatoryStyles.observatory} health-observatory-route health-observatory-error`} aria-labelledby="health-error-title"><div className={`${styles.panel} health-observatory-error-panel`} role="alert"><AlertTriangle size={24} aria-hidden="true" /><div><h1 id="health-error-title" ref={headingRef} tabIndex={-1}>{routeCopy.title}</h1><p>{routeCopy.description}</p><button type="button" onClick={reset}>Réessayer</button></div></div></section>;
}
