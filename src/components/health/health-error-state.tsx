"use client";

import { useEffect, useRef } from "react";

import { AlertTriangle } from "lucide-react";

import observatoryStyles from "./health-observatory.module.css";
import styles from "./health-error-state.module.css";

type HealthRoute = "sleep" | "recovery" | "activity";

const copy: Record<HealthRoute, { title: string; description: string }> = {
  sleep: { title: "Sleep is temporarily unavailable", description: "Soma could not load sleep data. Previously displayed sections are retained. Please retry for missing sections." },
  recovery: { title: "Recovery is temporarily unavailable", description: "Soma could not load recovery signals. Previously displayed sections are retained. Please retry for missing sections." },
  activity: { title: "Strain is temporarily unavailable", description: "Soma could not load activity data. Previously displayed sections are retained. Please retry for missing sections." },
};

export function HealthErrorState({ route, reset }: { route: HealthRoute; reset: () => void }) {
  const routeCopy = copy[route];
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  return <section className={`${styles.root} ${observatoryStyles.observatory} health-observatory-route health-observatory-error`} aria-labelledby="health-error-title"><div className={`${styles.panel} health-observatory-error-panel`} role="alert"><AlertTriangle size={24} aria-hidden="true" /><div><h1 id="health-error-title" ref={headingRef} tabIndex={-1}>{routeCopy.title}</h1><p>{routeCopy.description}</p><button type="button" onClick={reset}>Retry</button></div></div></section>;
}
