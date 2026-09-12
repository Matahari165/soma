"use client";

import { useEffect, useMemo, useRef, useState, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type { PersonalLabJournal, PersonalLabOverview } from "@/services/personal-lab";
import { useLabTheme } from "./lab-theme";
import { LabArrival } from "./lab-arrival";
import { OBSERVATORY_RADAR_PRESENTATION, ObservatoryRadar } from "./observatory-radar";
import { ArrivalBackdrop } from "./arrival-backdrops";
import { PersonalLabJournalWorkspace } from "./personal-lab-journal-workspace";
import { scrollToLabSectionWhenReady } from "./lab-scroll";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
}

export function LabWorldWorkspace({
  date: initialDateString,
  effects,
  capture,
  radar,
  overview,
  journal,
  initialSelectedDate,
}: {
  date?: string;
  radar?: ReactNode;
  effects: ReactNode;
  capture?: ReactNode;
  overview?: PersonalLabOverview;
  journal?: PersonalLabJournal;
  initialSelectedDate?: string;
}) {
  const theme = useLabTheme();
  const root = useRef<HTMLDivElement>(null);

  const todayDate = overview?.todayDate ?? journal?.todayDate;
  const availableDates = useMemo(() => {
    if (!todayDate) return [];
    return Array.from({ length: 7 }, (_, index) => addDays(todayDate, index - 6));
  }, [todayDate]);

  const [selectedDate, setSelectedDate] = useState(() => initialSelectedDate ?? todayDate ?? "");
  const activeDate = (availableDates.length > 0 && availableDates.includes(selectedDate))
    ? selectedDate
    : (todayDate ?? selectedDate);

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
  ) : capture;

  useEffect(() => {
    const change = () => { window.scrollTo({ top: 0 }); };
    window.addEventListener("lab-theme-change", change);
    return () => window.removeEventListener("lab-theme-change", change);
  }, []);
  useEffect(() => {
    if (window.location.hash !== "#world-effects") return;
    return scrollToLabSectionWhenReady("world-effects");
  }, []);
  useEffect(() => {
    const elements = root.current?.querySelectorAll<HTMLElement>(".lab-live-metrics .personal-lab-metric, .journal-period, .meal-journal-lab article");
    if (!elements || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const element = entry.target as HTMLElement;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { observer.unobserve(element); return; }
      element.animate([{ opacity: .35, transform: "translateY(24px)" }, { opacity: 1, transform: "none" }], { duration: 1300, easing: "cubic-bezier(.2,.7,.2,1)" });
      element.querySelectorAll(".metric-trace-line").forEach(line => line.animate([{ strokeDasharray: "500", strokeDashoffset: "500" }, { strokeDasharray: "500", strokeDashoffset: "0" }], { duration: 1000, easing: "ease-out" }));
      observer.unobserve(element);
    }), { threshold: .08 });
    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [theme]);
  return <div ref={root} id="main-page-content" className="lab-experience lab-continuous" data-continuous-theme={theme}>
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
      />
    </div>
    <div className="lab-world" lang="fr">
      <section id="world-capture" className="lab-world__capture" aria-label="Journal et repas">{activeCapture}</section>
      <section className="lab-world__effects" id="world-effects" aria-label="Associations personnelles">{effects}</section>
    </div>
  </div>;
}
