"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type { PersonalLabJournal, PersonalLabOverview } from "@/services/personal-lab";
import type { PersonalLabActivitySummary } from "@/domain/lab/activity-summary";
import { useLabTheme } from "./lab-theme";
import { LabArrival, type LabArrivalPersonalization } from "./lab-arrival";
import { OBSERVATORY_RADAR_PRESENTATION, ObservatoryRadar } from "./observatory-radar";
import { ArrivalBackdrop } from "./arrival-backdrops";
import { PersonalLabJournalWorkspace } from "./personal-lab-journal-workspace";
import { PersonalLabJournalLoading } from "./personal-lab";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
}

function dateFromUrl() {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("date");
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function writeDateToUrl(date: string) {
  if (typeof window === "undefined" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("date") === date) return;
  url.searchParams.set("date", date);
  window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
}

function StreamedJournalCapture({
  journalPromise,
  selectedDate,
  onDateChange,
  availableDates,
}: {
  journalPromise: Promise<PersonalLabJournal>;
  selectedDate: string;
  onDateChange: (date: string) => void;
  availableDates: readonly string[];
}) {
  const journal = use(journalPromise);
  return <PersonalLabJournalWorkspace
    data={journal}
    recentDatesFirst
    selectedDate={selectedDate}
    onDateChange={onDateChange}
    availableDates={availableDates}
  />;
}

export function LabWorldWorkspace({
  date: initialDateString,
  effects,
  capture,
  journalPromise,
  radar,
  overview,
  activitySummaries,
  journal,
  initialSelectedDate,
  personalization,
}: {
  date?: string;
  radar?: ReactNode;
  effects?: ReactNode;
  capture?: ReactNode;
  journalPromise?: Promise<PersonalLabJournal>;
  overview?: PersonalLabOverview;
  activitySummaries?: readonly PersonalLabActivitySummary[];
  journal?: PersonalLabJournal;
  initialSelectedDate?: string;
  personalization?: LabArrivalPersonalization;
}) {
  const theme = useLabTheme();
  const root = useRef<HTMLElement>(null);

  const todayDate = overview?.todayDate ?? journal?.todayDate;
  const availableDates = useMemo(() => {
    if (!todayDate) return [];
    return Array.from({ length: 7 }, (_, index) => addDays(todayDate, index - 6));
  }, [todayDate]);

  // Keep the server and first client render identical. The optional URL date
  // is applied by the effect below once the browser is mounted.
  const [selectedDate, setSelectedDate] = useState(() => initialSelectedDate ?? todayDate ?? "");
  const [urlDateApplied, setUrlDateApplied] = useState(() => Boolean(initialSelectedDate));
  const activeDate = (availableDates.length > 0 && availableDates.includes(selectedDate))
    ? selectedDate
    : (todayDate ?? selectedDate);

  useEffect(() => {
    if (initialSelectedDate || availableDates.length === 0) return;
    const urlDate = dateFromUrl();
    const apply = window.setTimeout(() => {
      if (urlDate && availableDates.includes(urlDate)) {
        setSelectedDate((current) => current === urlDate ? current : urlDate);
      }
      setUrlDateApplied(true);
    }, 0);
    return () => window.clearTimeout(apply);
  }, [availableDates, initialSelectedDate]);

  useEffect(() => {
    if (!urlDateApplied || !activeDate || !/^\d{4}-\d{2}-\d{2}$/.test(activeDate)) return;
    writeDateToUrl(activeDate);
  }, [activeDate, urlDateApplied]);

  useEffect(() => {
    function onPopState() {
      const urlDate = dateFromUrl();
      if (urlDate && availableDates.includes(urlDate)) {
        setSelectedDate(urlDate);
      } else if (!urlDate && todayDate) {
        setSelectedDate(todayDate);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [availableDates, todayDate]);

  const formattedDate = useMemo(() => {
    if (!activeDate) return initialDateString ?? "";
    return formatDate(activeDate);
  }, [activeDate, initialDateString]);

  const radarData = useMemo(() => {
    if (!overview) return null;
    if (activeDate === overview.todayDate) {
      return overview.today;
    }
    const point = overview.today.history.find((p) => p.date === activeDate);
    return {
      sleepMinutes: point?.sleepMinutes ?? null,
      recoveryScore: point?.recoveryScore ?? null,
      effortScore: point?.effortScore ?? null,
      caloriesKcal: point?.caloriesKcal ?? null,
      calorieTarget: point?.calorieTarget ?? null,
      averageSleepMinutes: overview.today.averageSleepMinutes,
      averageRecoveryScore: overview.today.averageRecoveryScore,
      averageEffortScore: overview.today.averageEffortScore,
      averageCaloriesKcal: overview.today.averageCaloriesKcal,
    };
  }, [activeDate, overview]);

  const radarPresentation = OBSERVATORY_RADAR_PRESENTATION;
  const activeRadar = radarData ? (
    <ObservatoryRadar data={radarData} date={activeDate} radius={radarPresentation.size} shiftX={radarPresentation.shiftX} shiftY={radarPresentation.shiftY} key={activeDate} />
  ) : radar && isValidElement(radar)
    ? cloneElement(radar as ReactElement<{ radius?: number; shiftX?: number; shiftY?: number }>, { radius: radarPresentation.size, shiftX: radarPresentation.shiftX, shiftY: radarPresentation.shiftY })
    : radar;

  const activeCapture = journal ? (
    <PersonalLabJournalWorkspace
      data={journal}
      recentDatesFirst
      selectedDate={activeDate}
      onDateChange={setSelectedDate}
      availableDates={availableDates}
    />
  ) : journalPromise ? (
    <Suspense fallback={<PersonalLabJournalLoading />}>
      <StreamedJournalCapture
        journalPromise={journalPromise}
        selectedDate={activeDate}
        onDateChange={setSelectedDate}
        availableDates={availableDates}
      />
    </Suspense>
  ) : capture;

  useEffect(() => {
    const change = () => { window.scrollTo({ top: 0 }); };
    window.addEventListener("lab-theme-change", change);
    return () => window.removeEventListener("lab-theme-change", change);
  }, []);
  return <main ref={root} id="main-page-content" className="lab-experience lab-continuous" data-continuous-theme={theme}>
    <div className="lab-intro">
      {theme === "observatory" && <ArrivalBackdrop variant={radarPresentation.backdrop} />}
      <LabArrival
        theme={theme}
        date={formattedDate}
        radar={activeRadar}
        selectedDate={activeDate}
        todayDate={todayDate}
        availableDates={availableDates}
        onDateChange={setSelectedDate}
        personalization={personalization}
        activitySummaries={activitySummaries}
      />
    </div>
    <div className="lab-world" lang="fr">
      <section id="world-capture" className="lab-world__capture" aria-label="Journal et repas">{activeCapture}</section>
      {effects ? <section className="lab-world__effects" aria-label="Associations personnelles">{effects}</section> : null}
    </div>
  </main>;
}
