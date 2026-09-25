"use client";

import { useEffect, useState, type ReactNode } from "react";
import { arrivalMessageFor, type ArrivalActivity, type ArrivalMessage } from "@/domain/lab/arrival-message";
import type { PersonalLabActivitySummary } from "@/domain/lab/activity-summary";
import { JOURNAL_PROGRESS_EVENT } from "./personal-lab-journal-workspace";

export type LabArrivalPersonalization = {
  name: string;
  timeZone: string;
  activity: ArrivalActivity | null;
  initialMessage: ArrivalMessage;
};

type JournalProgress = { date: string; count: number; total: number };

export function LabArrival({
  theme,
  date,
  radar,
  selectedDate,
  todayDate,
  personalization,
  activitySummaries,
}: {
  theme: string;
  date: string;
  radar: ReactNode;
  selectedDate?: string;
  todayDate?: string;
  availableDates?: readonly string[];
  onDateChange?: (date: string) => void;
  personalization?: LabArrivalPersonalization;
  activitySummaries?: readonly PersonalLabActivitySummary[];
}) {
  const [message, setMessage] = useState<ArrivalMessage>(() => personalization?.initialMessage ?? {
    moment: "morning",
    lines: ["Your own", "observatory."],
    activityNote: null,
  });
  const [journalProgress, setJournalProgress] = useState<JournalProgress | null>(null);
  const activity = personalization?.activity;
  const dayActivitySummary = activitySummaries?.find((summary) => summary.date === selectedDate && summary.count > 0) ?? null;
  useEffect(() => {
    if (!personalization) return;
    const refresh = () => setMessage(arrivalMessageFor({ name: personalization.name, timeZone: personalization.timeZone, activity: personalization.activity }));
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(interval);
  }, [activity, personalization]);
  useEffect(() => {
    const onJournalProgress = (event: Event) => {
      const detail = (event as CustomEvent<Partial<JournalProgress>>).detail;
      if (!detail || typeof detail.count !== "number" || typeof detail.total !== "number") return;
      setJournalProgress({
        date: typeof detail.date === "string" ? detail.date : "",
        count: Math.max(0, detail.count),
        total: Math.max(0, detail.total),
      });
    };
    window.addEventListener(JOURNAL_PROGRESS_EVENT, onJournalProgress);
    return () => window.removeEventListener(JOURNAL_PROGRESS_EVENT, onJournalProgress);
  }, []);
  return <section className="lab-arrival" data-arrival-theme={theme} aria-label="Personal lab home" key={theme}>
    <div className="arrival-composition" style={{ position: "relative" }}>
      <div className={`arrival-heading${personalization ? " arrival-heading--personalized" : ""}${dayActivitySummary ? " arrival-heading--with-activity" : ""}`} style={{ position: "relative", zIndex: 1 }}>
        <h1 id="arrival-title" tabIndex={-1}>
          {message.lines.map((line, index) => <span className="arrival-title-line" key={`${message.moment}-${index}`}><span>{line}</span></span>)}
        </h1>
        {selectedDate && todayDate && selectedDate !== todayDate && <time className="arrival-context-date" dateTime={selectedDate}>{date}</time>}
        {message.activityNote && <p className="arrival-signal"><span className="sr-only">Notable signal: </span>{message.activityNote}</p>}
        {journalProgress && <div className="arrival-journal-progress" aria-label={`Journal progress: ${journalProgress.count} habits confirmed out of ${journalProgress.total}`}>
          <div className="arrival-journal-progress__header">
            <span>Habits</span>
            <span>{journalProgress.count}/{journalProgress.total}</span>
          </div>
          <div className="arrival-journal-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={journalProgress.total} aria-valuenow={journalProgress.count} aria-label={`Journal progress: ${journalProgress.count} out of ${journalProgress.total}`}>
            <span style={{ transform: `scaleX(${journalProgress.total > 0 ? Math.min(1, journalProgress.count / journalProgress.total) : 0})` }} />
          </div>
        </div>}
        {dayActivitySummary && <section className="arrival-activity-summary" aria-label={`Activités du ${date}`}>
          <div className="arrival-activity-summary__identity">
            <strong>{dayActivitySummary.activity.name.trim() || activityTypeLabel(dayActivitySummary.activity.type)}</strong>
          </div>
          <dl className="arrival-activity-summary__metrics">
            {activitySummaryMetrics(dayActivitySummary).map(({ label, value }) => <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>)}
          </dl>
        </section>}
      </div>
      <div className="arrival-art" style={{ position: "relative", zIndex: 1 }}>{radar}</div>
    </div>
  </section>;
}

function activityTypeLabel(type: string) {
  const normalized = type.trim().replaceAll("-", "_").toUpperCase();
  const labels: Record<string, string> = {
    RUNNING: "Course à pied",
    JOGGING: "Course à pied",
    TRAIL_RUNNING: "Trail",
    BOXING: "Boxe",
    BOXE: "Boxe",
    HIKING: "Randonnée",
    WALKING: "Marche",
    WEIGHT_TRAINING: "Musculation",
    STRENGTH_TRAINING: "Musculation",
    CYCLING: "Vélo",
    BIKING: "Vélo",
    SWIMMING: "Natation",
    YOGA: "Yoga",
  };
  return (labels[normalized] ?? normalized.toLocaleLowerCase("fr-FR").replaceAll("_", " ")) || "Activité";
}

function activitySummaryMetrics(summary: PersonalLabActivitySummary) {
  const activity = summary.activity;
  const duration = finiteActivityValue(activity.durationMinutes);
  const distance = finiteActivityValue(activity.distanceKm);
  const pace = finiteActivityValue(activity.averagePaceSecondsPerKm);
  const averageHeartRate = finiteActivityValue(activity.averageHeartRate);
  const maximumHeartRate = finiteActivityValue(activity.maximumHeartRate);
  const calories = finiteActivityValue(activity.calories);
  return [
    { label: "Durée", value: duration === null ? "Indisponible" : formatActivityDuration(duration) },
    distance === null ? null : { label: "Distance", value: `${distance.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km` },
    pace === null || pace <= 0 ? null : { label: "Allure", value: `${Math.floor(Math.round(pace) / 60)}:${String(Math.round(pace) % 60).padStart(2, "0")} min/km` },
    averageHeartRate === null ? null : { label: "FC moy.", value: `${Math.round(averageHeartRate)} bpm` },
    maximumHeartRate === null ? null : { label: "FC max.", value: `${Math.round(maximumHeartRate)} bpm` },
    calories === null ? null : { label: "Calories", value: `${Math.round(calories).toLocaleString("fr-FR")} kcal` },
  ].filter((metric): metric is { label: string; value: string } => metric !== null);
}

function finiteActivityValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function formatActivityDuration(minutes: number) {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  return `${Math.floor(rounded / 60)} h ${String(rounded % 60).padStart(2, "0")}`;
}
