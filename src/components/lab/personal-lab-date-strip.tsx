"use client";

import { useState } from "react";

function formatDate(date: string, locale: "en-US" | "fr-CH") {
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
}

export function PersonalLabDateStrip({
  dates,
  selectedDate,
  todayDate,
  completedDates = new Set<string>(),
  disabled = false,
  progressByDate,
  onDateChange,
  ariaLabel,
  showDayStatus = true,
  locale = "en-US",
}: {
  dates: readonly string[];
  selectedDate: string;
  todayDate: string;
  completedDates?: ReadonlySet<string>;
  disabled?: boolean;
  progressByDate?: Record<string, { count: number; total: number }>;
  onDateChange: (date: string) => void;
  ariaLabel?: string;
  showDayStatus?: boolean;
  locale?: "en-US" | "fr-CH";
}) {
  const french = locale === "fr-CH";
  const todayLabel = french ? "Auj." : "Today";
  const initialStart = Math.max(0, Math.min(dates.length - 3, dates.indexOf(selectedDate) - 1));
  const [mobileStart, setMobileStart] = useState(initialStart);
  const selectedIndex = dates.indexOf(selectedDate);
  const mobileWindowStart = selectedIndex >= 0 && (selectedIndex < mobileStart || selectedIndex >= mobileStart + 3)
    ? Math.max(0, Math.min(dates.length - 3, selectedIndex - 1))
    : mobileStart;

  function renderDate(date: string) {
    const isSelected = date === selectedDate;
    const isToday = date === todayDate;
    const isCompleted = completedDates.has(date);
    const progress = progressByDate?.[date];
    const progressLabel = progress ? `${progress.count}/${progress.total}` : null;
    const monthDay = new Intl.DateTimeFormat(locale, french ? { day: "2-digit", month: "2-digit" } : { month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
    return (
      <button
        key={date}
        type="button"
        disabled={disabled}
        aria-current={isSelected ? "date" : undefined}
        onClick={() => onDateChange(date)}
        className={`${isSelected ? "is-selected" : ""} personal-lab-day-strip__day flex flex-col items-center justify-center py-1.5 px-2 rounded transition-all duration-150 relative interactive-press active:scale-[0.96]`}
      >
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-content-secondary">
          <span className={`${isSelected ? "text-content-primary " : ""}personal-lab-day-strip__label`} data-mobile-label={isToday ? todayLabel : weekday}>{isToday ? `${todayLabel}${french ? " " : ", "}${monthDay}` : weekday}</span>
          {showDayStatus && !isSelected && <span className={isCompleted ? "text-sage text-[10px]" : "text-content-tertiary text-[10px]"} aria-hidden="true">{isCompleted ? "✓" : "•"}</span>}
        </div>
        {progressLabel && <span className={`${isSelected ? "text-sage-muted" : "text-content-tertiary"} text-[10px] font-mono mt-0.5`}>{progressLabel}</span>}
        <span className="sr-only">{formatDate(date, locale)}</span>
      </button>
    );
  }

  return (
    <section className="w-full bg-surface-card/40 personal-lab-day-strip overflow-hidden" data-purpose="timeline-selector" aria-label={ariaLabel ?? (french ? "Jour commun aux repas et au journal" : "Shared day between meals and journal")}>
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-3 w-full min-w-0">
        <div className="personal-lab-day-strip__desktop personal-lab-day-strip__days" role="group" aria-label={french ? "Jours disponibles" : "Available days"}>
          {dates.map(renderDate)}
        </div>
        <div className="personal-lab-day-strip__mobile" role="group" aria-label={french ? "Jours disponibles" : "Available days"}>
          <button type="button" className="personal-lab-day-strip__arrow" aria-label={french ? "Afficher les jours précédents" : "Show previous days"} disabled={disabled || mobileWindowStart === 0} onClick={() => setMobileStart(Math.max(0, mobileWindowStart - 3))}>‹</button>
          <div className="personal-lab-day-strip__mobile-days">{dates.slice(mobileWindowStart, mobileWindowStart + 3).map(renderDate)}</div>
          <button type="button" className="personal-lab-day-strip__arrow" aria-label={french ? "Afficher les jours suivants" : "Show next days"} disabled={disabled || mobileWindowStart >= dates.length - 3} onClick={() => setMobileStart(Math.min(Math.max(0, dates.length - 3), mobileWindowStart + 3))}>›</button>
        </div>
      </div>
    </section>
  );
}
