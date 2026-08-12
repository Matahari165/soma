"use client";

import { ArrowDown, ArrowUp, Check, ChevronRight, CircleSlash, LoaderCircle, Settings2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDialogLayer } from "@/components/use-dialog-layer";
import type { DashboardSnapshot } from "@/domain/health";

import { ScoreLink } from "./score-link";
import { RecoveryTrend, SleepRegularity, WeeklyEffort } from "./widgets";

type WidgetId = "weekly-effort" | "recovery-trend" | "sleep-regularity";
type Widget = { id: WidgetId; visible: boolean };
const defaultWidgets: Widget[] = [{ id: "weekly-effort", visible: true }, { id: "recovery-trend", visible: true }, { id: "sleep-regularity", visible: true }];
const widgetIds = new Set<WidgetId>(defaultWidgets.map((widget) => widget.id));

function normalizeWidgets(value: unknown): Widget[] {
  if (!value || typeof value !== "object" || !("widgets" in value) || !Array.isArray(value.widgets)) return defaultWidgets;
  const valid = value.widgets.filter((item): item is Widget => Boolean(
    item && typeof item === "object" && "id" in item && "visible" in item &&
    widgetIds.has(item.id as WidgetId) && typeof item.visible === "boolean",
  ));
  if (valid.length !== defaultWidgets.length || new Set(valid.map((item) => item.id)).size !== defaultWidgets.length) return defaultWidgets;
  return valid;
}

export function HealthConnectedNotice() {
  return <div className="dashboard-notice" role="status">
    <Check size={18} aria-hidden="true" />
    <div><strong>Google Health connected</strong><p>Your first import is running in the background.</p></div>
    <Link href="/settings?health=connected">View connection</Link>
  </div>;
}

export function Dashboard({ data, healthConnected = false }: { data: DashboardSnapshot; healthConnected?: boolean }) {
  const [customizing, setCustomizing] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>(defaultWidgets);
  const [savedWidgets, setSavedWidgets] = useState<Widget[]>(defaultWidgets);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const customizeRef = useRef<HTMLElement>(null);
  const closeCustomization = useCallback(() => {
    if (!saving) {
      setWidgets(savedWidgets);
      setCustomizing(false);
    }
  }, [savedWidgets, saving]);

  useDialogLayer({ open: customizing, onClose: closeCustomization, containerRef: customizeRef });

  useEffect(() => {
    Promise.resolve().then(() => {
      const local = window.localStorage.getItem("soma:dashboard-layout");
      if (local) {
        try {
          const nextWidgets = normalizeWidgets(JSON.parse(local));
          setWidgets(nextWidgets);
          setSavedWidgets(nextWidgets);
        } catch {
          setWidgets(defaultWidgets);
          setSavedWidgets(defaultWidgets);
        }
      } else {
        fetch("/api/dashboard-layout")
          .then((response) => response.ok ? response.json() : Promise.reject(new Error("Layout unavailable")))
          .then((layout) => {
            const nextWidgets = normalizeWidgets(layout);
            setWidgets(nextWidgets);
            setSavedWidgets(nextWidgets);
          })
          .catch(() => {
            setWidgets(defaultWidgets);
            setSavedWidgets(defaultWidgets);
          });
      }
    });
  }, []);

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= widgets.length) return;
    setWidgets((current) => { const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next; });
  }

  async function saveLayout() {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/dashboard-layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ widgets }) });
      if (!response.ok) throw new Error("Your layout could not be saved. Try again.");
      window.localStorage.setItem("soma:dashboard-layout", JSON.stringify({ widgets }));
      setSavedWidgets(widgets);
      setSaved(true);
      window.setTimeout(() => { setSaved(false); setCustomizing(false); }, 650);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Your layout could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const widgetComponents: Record<WidgetId, React.ReactNode> = {
    "weekly-effort": <WeeklyEffort data={data.weeklyEffort} />,
    "recovery-trend": <RecoveryTrend data={data.recoveryTrend} />,
    "sleep-regularity": <SleepRegularity data={data.sleepRegularity} />,
  };
  const widgetLabels: Record<WidgetId, string> = { "weekly-effort": "Weekly effort", "recovery-trend": "Recovery trend", "sleep-regularity": "Sleep regularity" };
  const visibleWidgets = widgets.filter((widget) => widget.visible);

  return (
    <div className="dashboard-page">
      {healthConnected && <HealthConnectedNotice />}
      <section className="dashboard-hero" aria-labelledby="today-heading">
        <div className="page-header">
          <div>
            <p className="page-date">{data.dateLabel}</p>
            <h1 id="today-heading">{data.greeting}, {data.greetingName}</h1>
          </div>
          <div className="page-actions">
            <button className="secondary-button customize-button" type="button" onClick={() => setCustomizing(true)} aria-label="Customize dashboard"><Settings2 size={17} /><span>Customize</span></button>
          </div>
        </div>

        <nav className="primary-metrics" aria-label="Today's primary health scores">
          <header className="signal-array__header"><h2>Today&apos;s signals</h2></header>
          <div className="signal-array__rows">
            {data.scores.map((score) => <ScoreLink metric={score} key={score.kind} />)}
          </div>
        </nav>
      </section>

      <section className="soma-summary" aria-labelledby="soma-summary-title">
        <h2 id="soma-summary-title" className="sr-only">Today&apos;s summary</h2>
        <p>{data.summary}</p>
        <Link className="summary-button" href="/coach">Coach <ChevronRight size={16} /></Link>
      </section>

      <section className="section-block" aria-labelledby="insights-heading">
        <div className="section-heading">
          <h2 id="insights-heading">Patterns</h2>
          <Link className="text-link" href="/trends">View trends <ChevronRight size={15} /></Link>
        </div>
        {data.insights.length ? <div className="insight-list">
          {data.insights.map((insight) => (
            <article className={`insight insight--${insight.category}`} key={insight.id}>
              <div>
                <h3>{insight.title}</h3>
                <p>{insight.description}</p>
                <small>{insight.evidence}</small>
              </div>
              <Link href="/trends" aria-label={`Explore insight: ${insight.title}`}><ChevronRight size={18} /></Link>
            </article>
          ))}
        </div> : <div className="inline-empty" role="status"><CircleSlash size={20} aria-hidden="true" /><div><strong>More data needed</strong><p>Patterns will appear after complete measurements arrive.</p></div></div>}
      </section>

      {visibleWidgets.length > 0 && <section className="section-block" aria-labelledby="overview-heading">
        <div className="section-heading">
          <h2 id="overview-heading">Last 7 days</h2>
          <Link href="/trends" className="text-link">Details <ChevronRight size={15} /></Link>
        </div>
        <div className="widget-grid">{visibleWidgets.map((widget) => <div className="widget-slot" key={widget.id}>{widgetComponents[widget.id]}</div>)}</div>
      </section>}

      {customizing && <><button className="panel-backdrop" type="button" onClick={closeCustomization} aria-label="Close customization panel" /><aside ref={customizeRef} className="customize-panel" role="dialog" aria-modal="true" aria-labelledby="customize-title"><header><div><span className="eyebrow">Dashboard layout</span><h2 id="customize-title">Customize your overview</h2></div><button className="icon-button" type="button" onClick={closeCustomization} aria-label="Close customization"><X size={19} /></button></header><div className="customize-list">{widgets.map((widget, index) => <div key={widget.id}><label><input type="checkbox" checked={widget.visible} onChange={() => setWidgets((current) => current.map((item) => item.id === widget.id ? { ...item, visible: !item.visible } : item))} /><span>{widgetLabels[widget.id]}</span></label><span><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${widgetLabels[widget.id]} up`}><ArrowUp size={15} /></button><button type="button" disabled={index === widgets.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${widgetLabels[widget.id]} down`}><ArrowDown size={15} /></button></span></div>)}</div>{saveError && <p className="form-error" role="alert">{saveError}</p>}<button className="primary-button" type="button" onClick={() => void saveLayout()} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={17} />Saving…</> : saved ? <><Check size={17} />Saved</> : "Save layout"}</button></aside></>}
    </div>
  );
}
