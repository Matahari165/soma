"use client";

import { useState } from "react";

import { filterCalendarWindow, type MetricPoint } from "@/domain/metrics/trends";
import type { HealthMetricDay, ScoreDay } from "@/services/health-analytics";

import { MetricTrendCard } from "./metric-trend-card";

type WindowDays = 7 | 30 | 90;

export function TrendsOverview({ days, scores }: { days: HealthMetricDay[]; scores: ScoreDay[] }) {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const metricPoints = (key: keyof HealthMetricDay): MetricPoint[] => days.map((day) => ({ date: day.metric_date, value: typeof day[key] === "number" ? day[key] as number : null }));
  const scorePoints = (kind: ScoreDay["kind"]): MetricPoint[] => scores.filter((score) => score.kind === kind).map((score) => ({ date: score.score_date, value: score.score }));
  const inWindow = (points: MetricPoint[]) => filterCalendarWindow(points, windowDays);
  const hasData = (points: MetricPoint[]) => points.some((point) => point.value !== null);

  const sleepScores = scorePoints("sleep");
  const recoveryScores = scorePoints("recovery");
  const effortScores = scorePoints("effort");
  const hrvPoints = metricPoints("hrv_ms");
  const restingHeartRatePoints = metricPoints("resting_heart_rate");
  const stepPoints = metricPoints("steps");
  const trendCards = [
    hasData(inWindow(sleepScores)) ? <MetricTrendCard key="sleep" label="Sleep score" points={sleepScores} displayDays={windowDays} unit="/100" direction="higher_is_better" href="/sleep" /> : null,
    hasData(inWindow(recoveryScores)) ? <MetricTrendCard key="recovery" label="Recovery score" points={recoveryScores} displayDays={windowDays} unit="/100" direction="higher_is_better" href="/recovery" /> : null,
    hasData(inWindow(effortScores)) ? <MetricTrendCard key="effort" label="Effort score" points={effortScores} displayDays={windowDays} unit="/100" direction="context_only" href="/activity" /> : null,
    hasData(inWindow(hrvPoints)) ? <MetricTrendCard key="hrv" label="HRV" points={hrvPoints} displayDays={windowDays} unit="ms" direction="higher_is_better" href="/recovery" /> : null,
    hasData(inWindow(restingHeartRatePoints)) ? <MetricTrendCard key="rhr" label="Resting heart rate" points={restingHeartRatePoints} displayDays={windowDays} unit="bpm" direction="lower_is_better" href="/recovery" /> : null,
    hasData(inWindow(stepPoints)) ? <MetricTrendCard key="steps" label="Steps" points={stepPoints} displayDays={windowDays} direction="higher_is_better" format={(value) => Math.round(value).toLocaleString("en-US")} href="/activity" /> : null,
  ].filter((card) => card !== null);

  return <>
    <div className="trend-window" role="group" aria-label="Trend window">
      {([7, 30, 90] as const).map((value) => <button key={value} type="button" aria-pressed={windowDays === value} onClick={() => setWindowDays(value)}>{value} days</button>)}
    </div>
    <section className="metric-trend-grid trends-overview" aria-label={`${windowDays}-day personal trend overview`}>
      {trendCards}
      {trendCards.length < 6 && <article className="metric-trend-card metric-trend-card--locked"><strong>{6 - trendCards.length}</strong><h2>signals pending</h2><p>More measured days will reveal them.</p></article>}
    </section>
  </>;
}
