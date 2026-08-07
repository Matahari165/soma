"use client";

import { ArrowDown, ArrowUp, Bell, Check, ChevronRight, RefreshCw, Settings2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { DashboardSnapshot } from "@/domain/health";

import { MetricCard } from "./metric-card";
import { RecoveryTrend, SleepRegularity, WeeklyEffort } from "./widgets";

export function Dashboard({ data, demoMode }: { data: DashboardSnapshot; demoMode: boolean }) {
  type WidgetId = "weekly-effort" | "recovery-trend" | "sleep-regularity";
  type Widget = { id: WidgetId; visible: boolean };
  const defaultWidgets: Widget[] = [{ id: "weekly-effort", visible: true }, { id: "recovery-trend", visible: true }, { id: "sleep-regularity", visible: true }];
  const [customizing, setCustomizing] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>(defaultWidgets);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      const local = window.localStorage.getItem("soma:dashboard-layout");
      if (local) {
        try { setWidgets(JSON.parse(local).widgets); } catch { /* use the safe default */ }
      } else if (!demoMode) {
        fetch("/api/dashboard-layout").then((response) => response.json()).then((layout) => setWidgets(layout.widgets ?? defaultWidgets)).catch(() => undefined);
      }
    });
  // The initial layout is intentionally loaded once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode]);

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= widgets.length) return;
    setWidgets((current) => { const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next; });
  }

  async function saveLayout() {
    window.localStorage.setItem("soma:dashboard-layout", JSON.stringify({ widgets }));
    if (!demoMode) await fetch("/api/dashboard-layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ widgets }) });
    setSaved(true); setTimeout(() => { setSaved(false); setCustomizing(false); }, 600);
  }

  const widgetComponents: Record<WidgetId, React.ReactNode> = {
    "weekly-effort": <WeeklyEffort data={data.weeklyEffort} />,
    "recovery-trend": <RecoveryTrend data={data.recoveryTrend} />,
    "sleep-regularity": <SleepRegularity data={data.sleepRegularity} />,
  };
  const widgetLabels: Record<WidgetId, string> = { "weekly-effort": "Weekly effort", "recovery-trend": "Recovery trend", "sleep-regularity": "Sleep regularity" };

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div>
          <p className="page-date">{data.dateLabel}</p>
          <h1>Good afternoon, {data.greetingName}.</h1>
          <p className="page-subtitle">Here is what your body is telling you today.</p>
        </div>
        <div className="page-actions">
          {demoMode && <span className="demo-badge">Demo data</span>}
          <button className="secondary-button" type="button" onClick={() => setCustomizing(true)}><Settings2 size={17} /> Customize</button>
          <button className="icon-button icon-button--surface" type="button" aria-label="View notifications"><Bell size={18} /></button>
        </div>
      </div>

      <div className="sync-banner" role="status">
        <span className="sync-dot" aria-hidden="true" />
        <span>All available data processed</span>
        <span className="sync-time"><RefreshCw size={13} /> Last sync 1:45 PM</span>
      </div>

      <section className="primary-metrics" aria-label="Today's primary health scores">
        {data.scores.map((score) => <MetricCard metric={score} key={score.kind} />)}
      </section>

      <section className="soma-summary" aria-labelledby="soma-summary-title">
        <div className="summary-icon" aria-hidden="true"><Sparkles size={22} /></div>
        <div className="summary-copy">
          <span className="eyebrow">Soma summary</span>
          <h2 id="soma-summary-title">A good day to build, without overreaching.</h2>
          <p>{data.summary}</p>
        </div>
        <Link className="summary-button" href="/coach">Ask a follow-up <ChevronRight size={16} /></Link>
      </section>

      <section className="section-block" aria-labelledby="insights-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Worth your attention</span>
            <h2 id="insights-heading">Today&apos;s insights</h2>
          </div>
          <Link className="text-link" href="/trends">View all <ChevronRight size={15} /></Link>
        </div>
        <div className="insight-list">
          {data.insights.map((insight) => (
            <article className={`insight insight--${insight.category}`} key={insight.id}>
              <span className="insight-marker" aria-hidden="true" />
              <div>
                <h3>{insight.title}</h3>
                <p>{insight.description}</p>
                <small>{insight.evidence}</small>
              </div>
              <Link href="/trends" aria-label={`Explore insight: ${insight.title}`}><ChevronRight size={18} /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block" aria-labelledby="overview-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your patterns</span>
            <h2 id="overview-heading">Weekly overview</h2>
          </div>
          <Link href="/trends" className="text-link">Explore trends <ChevronRight size={15} /></Link>
        </div>
        <div className="widget-grid">{widgets.filter((widget) => widget.visible).map((widget) => <div className="widget-slot" key={widget.id}>{widgetComponents[widget.id]}</div>)}</div>
      </section>

      <p className="medical-note">Soma supports general wellness and is not a medical device. Seek professional advice for health concerns.</p>
      {customizing && <><button className="panel-backdrop" type="button" onClick={() => setCustomizing(false)} aria-label="Close customization panel" /><aside className="customize-panel" aria-label="Customize dashboard"><header><div><span className="eyebrow">Dashboard layout</span><h2>Customize your overview</h2></div><button className="icon-button" type="button" onClick={() => setCustomizing(false)} aria-label="Close"><X size={19} /></button></header><p>The three primary scores stay fixed. Choose and order the supporting widgets below.</p><div className="customize-list">{widgets.map((widget, index) => <div key={widget.id}><label><input type="checkbox" checked={widget.visible} onChange={() => setWidgets((current) => current.map((item) => item.id === widget.id ? { ...item, visible: !item.visible } : item))} /><span>{widgetLabels[widget.id]}</span></label><span><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${widgetLabels[widget.id]} up`}><ArrowUp size={15} /></button><button type="button" disabled={index === widgets.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${widgetLabels[widget.id]} down`}><ArrowDown size={15} /></button></span></div>)}</div><button className="primary-button" type="button" onClick={() => void saveLayout()}>{saved ? <><Check size={17} />Saved</> : "Save layout"}</button></aside></>}
    </div>
  );
}
