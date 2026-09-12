"use client";

import type { ReactNode } from "react";

export function LabArrival({
  theme,
  date,
  radar,
  selectedDate,
  todayDate,
  availableDates,
  onDateChange,
}: {
  theme: string;
  date: string;
  radar: ReactNode;
  selectedDate?: string;
  todayDate?: string;
  availableDates?: readonly string[];
  onDateChange?: (date: string) => void;
}) {
  const title = ["Votre propre", "observatoire."];
  const currentIndex = availableDates && selectedDate ? availableDates.indexOf(selectedDate) : -1;
  const canGoPrevious = onDateChange && availableDates && currentIndex > 0;
  const canGoNext = onDateChange && availableDates && currentIndex >= 0 && currentIndex < availableDates.length - 1 && selectedDate !== todayDate;

  return <section className="lab-arrival" data-arrival-theme={theme} aria-label="Accueil Personal Lab" key={theme}>
    <div className="arrival-composition" style={{ position: "relative" }}>
      <div className="arrival-heading" style={{ position: "relative", zIndex: 1 }}>
        <h1 id="arrival-title" tabIndex={-1}>
          <span className="arrival-title-line"><span>{title[0]}</span></span>
          <span className="arrival-title-line"><span>{title[1]}</span></span>
        </h1>
        <div className="arrival-date-nav" role="group" aria-label="Navigation des jours">
          {onDateChange && availableDates && (
            <button
              type="button"
              className="arrival-date-nav__btn"
              disabled={!canGoPrevious}
              onClick={() => canGoPrevious && onDateChange(availableDates[currentIndex - 1])}
              aria-label="Jour précédent"
            >
              ‹
            </button>
          )}
          <time className="arrival-date">{date}</time>
          {onDateChange && availableDates && (
            <button
              type="button"
              className="arrival-date-nav__btn"
              disabled={!canGoNext}
              onClick={() => canGoNext && onDateChange(availableDates[currentIndex + 1])}
              aria-label="Jour suivant"
            >
              ›
            </button>
          )}
        </div>
      </div>
      <div className="arrival-art" style={{ position: "relative", zIndex: 1 }}>{radar}</div>
    </div>
  </section>;
}
