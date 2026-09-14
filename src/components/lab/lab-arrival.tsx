"use client";

import { useEffect, useState, type ReactNode } from "react";
import { arrivalMessageFor, type ArrivalActivity, type ArrivalMessage } from "@/domain/lab/arrival-message";

export type LabArrivalPersonalization = {
  name: string;
  timeZone: string;
  activity: ArrivalActivity | null;
  initialMessage: ArrivalMessage;
};

export function LabArrival({
  theme,
  date,
  radar,
  selectedDate,
  todayDate,
  availableDates,
  onDateChange,
  personalization,
}: {
  theme: string;
  date: string;
  radar: ReactNode;
  selectedDate?: string;
  todayDate?: string;
  availableDates?: readonly string[];
  onDateChange?: (date: string) => void;
  personalization?: LabArrivalPersonalization;
}) {
  const [message, setMessage] = useState<ArrivalMessage>(() => personalization?.initialMessage ?? {
    moment: "morning",
    lines: ["Votre propre", "observatoire."],
    activityNote: null,
  });
  const activity = personalization?.activity;
  useEffect(() => {
    if (!personalization) return;
    const refresh = () => setMessage(arrivalMessageFor({ name: personalization.name, timeZone: personalization.timeZone, activity: personalization.activity }));
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(interval);
  }, [activity, personalization]);
  const currentIndex = availableDates && selectedDate ? availableDates.indexOf(selectedDate) : -1;
  const canGoPrevious = onDateChange && availableDates && currentIndex > 0;
  const canGoNext = onDateChange && availableDates && currentIndex >= 0 && currentIndex < availableDates.length - 1 && selectedDate !== todayDate;
  const displayDate = date ? `${date.charAt(0).toLocaleUpperCase("fr-FR")}${date.slice(1)}` : date;

  return <section className="lab-arrival" data-arrival-theme={theme} aria-label="Accueil du laboratoire personnel" key={theme}>
    <div className="arrival-composition" style={{ position: "relative" }}>
      <div className={`arrival-heading${personalization ? " arrival-heading--personalized" : ""}`} style={{ position: "relative", zIndex: 1 }}>
        <h1 id="arrival-title" tabIndex={-1}>
          {message.lines.map((line, index) => <span className="arrival-title-line" key={`${message.moment}-${index}`}><span>{line}</span></span>)}
        </h1>
        {message.activityNote && <p className="arrival-signal"><span className="sr-only">Signal remarquable : </span>{message.activityNote}</p>}
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
          <time className="arrival-date">{displayDate}</time>
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
