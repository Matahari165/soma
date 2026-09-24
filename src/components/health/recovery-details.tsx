"use client";

import { useEffect, useRef, useState } from "react";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import type { HealthAnalytics, HealthMetricDay, ScoreDay } from "@/services/health-analytics";

import { averageLast30MeasuredWithCount, formatAverage, healthSourceLabel, latestSourceMeasuredAt, measuredCoverage } from "./health-metric-utils";
import { HealthPageShell } from "./health-page-shell";
import { MetricTrendCard } from "./metric-trend-card";
import type { RecoveryRadarDimension } from "./recovery-radar";
import { RecoveryRadar } from "./recovery-radar";
import { RecoveryScorePopover } from "./recovery-score-popover";
import styles from "./recovery-redesign.module.css";

type TrendKind = "hrv_daily" | "resting_heart_rate" | "respiratory_rate";
type ZoneKey = "light_zone_minutes" | "moderate_zone_minutes" | "vigorous_zone_minutes" | "peak_zone_minutes";
type ZoneTone = "light" | "moderate" | "vigorous" | "peak";

const trendLabels: Record<TrendKind, { label: string; unit: string; direction: "higher" | "lower" | "context" }> = {
  hrv_daily: { label: "HRV", unit: "ms", direction: "higher" },
  resting_heart_rate: { label: "Resting heart rate", unit: "bpm", direction: "lower" },
  respiratory_rate: { label: "Respiratory rate", unit: "rpm", direction: "context" },
};

const metricKeys: Record<TrendKind, keyof HealthMetricDay> = {
  hrv_daily: "hrv_ms",
  resting_heart_rate: "resting_heart_rate",
  respiratory_rate: "respiratory_rate",
};

const zoneDefinitions: Array<{ key: ZoneKey; label: string; tone: ZoneTone }> = [
  { key: "light_zone_minutes", label: "Light", tone: "light" },
  { key: "moderate_zone_minutes", label: "Moderate", tone: "moderate" },
  { key: "vigorous_zone_minutes", label: "Vigorous", tone: "vigorous" },
  { key: "peak_zone_minutes", label: "Peak", tone: "peak" },
];

const directionMap: Record<string, "higher_is_better" | "lower_is_better" | "context_only"> = {
  higher: "higher_is_better",
  lower: "lower_is_better",
  context: "context_only",
};

const visibleTrendKeys: TrendKind[] = ["hrv_daily", "resting_heart_rate", "respiratory_rate"];

function points(days: HealthMetricDay[], key: TrendKind) {
  return days.map((day) => {
    const value = day[metricKeys[key]];
    return { date: day.metric_date, value: typeof value === "number" && Number.isFinite(value) ? value : null };
  });
}

function formatValue(value: number | null, decimals = 0) {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(decimals).replace(/\.0+$/, "");
}

function scoreDriver(drivers: Record<string, unknown> | undefined, key: string) {
  const value = drivers?.[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function averageLast30Scores(scores: ScoreDay[], kind: ScoreDay["kind"], endDate: string | undefined) {
  const latestDate = endDate ?? scores.filter((item) => item.kind === kind).map((item) => item.score_date).sort().at(-1);
  if (!latestDate) return null;
  const start = new Date(`${latestDate}T12:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return null;
  start.setUTCDate(start.getUTCDate() - 29);
  const startDate = start.toISOString().slice(0, 10);
  const values = scores
    .filter((item) => item.kind === kind && item.score_date >= startDate && item.score_date <= latestDate && typeof item.score === "number" && Number.isFinite(item.score))
    .map((item) => item.score as number);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function hasRecoveryMeasurement(day: HealthMetricDay) {
  return [
    day.sleep_minutes,
    day.hrv_ms,
    day.resting_heart_rate,
    day.respiratory_rate,
    day.oxygen_saturation,
    day.oxygen_saturation_lower,
    day.oxygen_saturation_upper,
    day.skin_temperature_delta,
    day.nightly_temperature_celsius,
    day.baseline_temperature_celsius,
    day.light_zone_minutes,
    day.moderate_zone_minutes,
    day.vigorous_zone_minutes,
    day.peak_zone_minutes,
    day.vo2_max,
    day.core_body_temperature_celsius,
  ].some((value) => typeof value === "number" && Number.isFinite(value));
}

function civilDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
}

function formatCivilDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(civilDate(value)).replace(".", "");
}

function zoneDotClassName(tone: ZoneTone) {
  if (tone === "light") return styles.zoneDot;
  return `${styles.zoneDot} ${styles[`zoneDot--${tone}`]}`;
}

/** Averages each zone over measured days in the local Monday–Sunday week. */
export function averageWeeklyZoneMinutes(days: HealthMetricDay[], endDate?: string) {
  const latestDate = endDate ?? [...days].map((day) => day.metric_date).sort().at(-1);
  if (!latestDate || !Number.isFinite(civilDate(latestDate).getTime())) {
    return { startDate: null, endDate: null, zones: zoneDefinitions.map((zone) => ({ ...zone, minutes: null, measuredDays: 0 })) };
  }
  const latest = civilDate(latestDate);
  const weekday = latest.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = new Date(latest);
  start.setUTCDate(start.getUTCDate() + mondayOffset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const startDate = start.toISOString().slice(0, 10);
  const weekEndDate = end.toISOString().slice(0, 10);
  const weekDays = days.filter((day) => day.metric_date >= startDate && day.metric_date <= weekEndDate);
  return {
    startDate,
    endDate: weekEndDate,
    zones: zoneDefinitions.map((zone) => {
      const values = weekDays
        .map((day) => day[zone.key])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return { ...zone, minutes: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, measuredDays: values.length };
    }),
  };
}

function WeeklyZoneChart({ summary }: { summary: ReturnType<typeof averageWeeklyZoneMinutes> }) {
  const measuredZones = summary.zones.filter((zone) => typeof zone.minutes === "number" && Number.isFinite(zone.minutes));
  const total = measuredZones.reduce((sum, zone) => sum + Math.max(0, zone.minutes ?? 0), 0);
  const valueText = (minutes: number | null) => minutes === null || !Number.isFinite(minutes) ? "—" : `${Math.round(minutes)} min/day`;
  const description = `Daily average of heart-rate zones, week of ${summary.startDate ? formatCivilDate(summary.startDate) : "—"} to ${summary.endDate ? formatCivilDate(summary.endDate) : "—"}: ${summary.zones.map((zone) => `${zone.label} ${valueText(zone.minutes)}, ${zone.measuredDays} measured day${zone.measuredDays > 1 ? "s" : ""}`).join("; ")}.`;
  return <div className={styles.weeklyZones}>
    <div className={styles.zoneBar} role="img" aria-label={description}>
      {measuredZones.filter((zone) => (zone.minutes ?? 0) > 0).map((zone) => <span key={zone.label} className={`${styles.zoneSegment} ${styles[`zoneSegment--${zone.tone}`]}`} style={{ width: `${total ? ((zone.minutes ?? 0) / total) * 100 : 0}%` }} />)}
    </div>
    <p className="sr-only">{description}</p>
    <ul className={styles.zoneLegend}>{summary.zones.map((zone) => <li key={zone.label}><span className={zoneDotClassName(zone.tone)} /> <span>{zone.label}</span><strong>{valueText(zone.minutes)}</strong></li>)}</ul>
  </div>;
}

function scoreText(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : Math.round(value).toLocaleString("en-US");
}

export function RecoveryDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.findLast(hasRecoveryMeasurement);
  const recoveryScore = data.scores.findLast((item) => item.kind === "recovery" && item.score_date === latest?.metric_date);
  const score = recoveryScore?.score ?? null;
  const signalAverages = {
    hrv: latest ? averageLast30MeasuredWithCount(data.days, "hrv_ms", latest.metric_date) : { value: null, measuredDays: 0 },
    restingHeartRate: latest ? averageLast30MeasuredWithCount(data.days, "resting_heart_rate", latest.metric_date) : { value: null, measuredDays: 0 },
    respiratoryRate: latest ? averageLast30MeasuredWithCount(data.days, "respiratory_rate", latest.metric_date) : { value: null, measuredDays: 0 },
  };
  const averages = {
    hrv: signalAverages.hrv.value,
    restingHeartRate: signalAverages.restingHeartRate.value,
    respiratoryRate: signalAverages.respiratoryRate.value,
    recovery: averageLast30Scores(data.scores, "recovery", latest?.metric_date),
  };
  const drivers = recoveryScore?.drivers;
  const driverCoverage = Number(drivers?.coverage);
  const coverage = Number.isFinite(driverCoverage)
    ? Math.min(1, Math.max(0, driverCoverage))
    : latest ? measuredCoverage([latest.hrv_ms, latest.resting_heart_rate, latest.sleep_minutes]) : 0;
  const freshness = calculateSignalFreshness({ measuredAt: latestSourceMeasuredAt(latest), importedAt: data.importedAt, coverage });
  const sourceLabel = healthSourceLabel(latest);
  const weeklyZones = averageWeeklyZoneMinutes(data.days, latest?.metric_date);
  const [selectedAxis, setSelectedAxis] = useState<string | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const radarButtonRefs = useRef<Record<string, SVGGElement | null>>({});
  const detailId = "recovery-radar-detail";
  const detailTitleId = "recovery-radar-detail-title";
  const detailOpen = selectedAxis !== null;
  const dimensions: RecoveryRadarDimension[] = [
    { key: "hrv", label: "HRV", score: scoreDriver(drivers, "hrv"), weight: 40, valueLabel: scoreDriver(drivers, "hrv") === null ? undefined : `${scoreDriver(drivers, "hrv")}%`, averageLabel: averages.hrv === null ? undefined : `30-day avg · ${Math.round(averages.hrv)} ms · n=${signalAverages.hrv.measuredDays}`, definition: "Daily heart rate variability reported by health source, compared to your personal baseline. The source does not specify whether it was measured during sleep.", readingDirection: "Higher = better", scoreRole: "Score component · 40%", scoreFormula: "deviation from personal baseline", scoreNormalization: "0–100", scoreContribution: null, sourceLabel },
    { key: "restingHeartRate", label: "Resting heart rate", score: scoreDriver(drivers, "restingHeartRate"), weight: 30, valueLabel: scoreDriver(drivers, "restingHeartRate") === null ? undefined : `${scoreDriver(drivers, "restingHeartRate")}%`, averageLabel: averages.restingHeartRate === null ? undefined : `30-day avg · ${Math.round(averages.restingHeartRate)} bpm · n=${signalAverages.restingHeartRate.measuredDays}`, definition: "Resting heart rate compared to your personal baseline.", readingDirection: "Lower = better", scoreRole: "Score component · 30%", scoreFormula: "deviation from personal baseline", scoreNormalization: "0–100", scoreContribution: null, sourceLabel },
    { key: "sleep", label: "Sleep", score: scoreDriver(drivers, "sleep"), weight: 30, valueLabel: scoreDriver(drivers, "sleep") === null ? undefined : `${scoreDriver(drivers, "sleep")}%`, averageLabel: averages.recovery === null ? undefined : `30-day avg · ${Math.round(averages.recovery)} /100`, definition: "Sleep score included as a recovery component.", readingDirection: "Higher = better", scoreRole: "Score component · 30%", scoreFormula: "Soma Sleep score", scoreNormalization: "0–100", scoreContribution: null, sourceLabel: "Soma" },
  ];
  const selectedDimension = dimensions.find((dimension) => dimension.key === selectedAxis) ?? null;
  useEffect(() => {
    if (selectedAxis) detailHeadingRef.current?.focus({ preventScroll: true });
  }, [selectedAxis]);
  useEffect(() => {
    if (!selectedAxis) return;
    const activeId: string = selectedAxis;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSelectedAxis(null);
      window.requestAnimationFrame(() => radarButtonRefs.current[activeId]?.focus());
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedAxis]);
  function closeAxisDetail() {
    const id = selectedAxis;
    setSelectedAxis(null);
    if (id) window.requestAnimationFrame(() => radarButtonRefs.current[id as string]?.focus());
  }
  return <div className={styles.page}>
    <HealthPageShell
      kind="recovery"
      title="Recovery"
      description="Recovery score, personal factors, and health signals."
      score={score}
      freshness={freshness}
      timezone={data.timezone}
      heroScore={<span className="sr-only">Recovery score: {scoreText(score)} out of 100. 30-day average: {scoreText(averages.recovery)} out of 100.</span>}
    >
      <section className={`${styles.content} health-observatory-content`} aria-label="Recovery content" data-recovery-scroll-reveal-root="true">
        {latest ? <>
          <section className={`${styles.heroScene} health-observatory-panel`} data-recovery-scroll-reveal="true" aria-labelledby="recovery-score-summary-title">
            <div className={styles.radarRegion} data-detail-open={detailOpen}>
              <h2 className="sr-only">Score factors</h2>
              <RecoveryRadar dimensions={dimensions} detailId={detailId} interactive selectedId={selectedAxis} onSelect={(id) => setSelectedAxis((current) => (current === id ? null : id))} registerButton={(id, node) => { radarButtonRefs.current[id] = node; }} />
              <aside className={styles.recoveryDetailPanel} id={detailId} data-open={detailOpen} aria-labelledby={detailTitleId} aria-hidden={!detailOpen} inert={!detailOpen}>
                <div className={styles.recoveryDetailHeader}>
                  <h3 id={detailTitleId} ref={detailHeadingRef} tabIndex={-1}>{selectedDimension?.label ?? "Details"}</h3>
                  <button className={styles.recoveryDetailClose} type="button" onClick={closeAxisDetail} tabIndex={detailOpen ? 0 : -1} aria-label={selectedDimension ? `Close ${selectedDimension.label} details` : "Close details"}>Close</button>
                </div>
                {selectedDimension && (
                  <dl className={styles.recoveryDimensionMetrics}>
                    <div><dt>Current value</dt><dd>{selectedDimension.valueLabel ?? "—"}</dd></div>
                    <div><dt>30-day avg</dt><dd>{selectedDimension.averageLabel ?? "—"}</dd></div>
                    <div><dt>Reading</dt><dd>{selectedDimension.readingDirection ?? "—"}</dd></div>
                    <div><dt>Role</dt><dd>{selectedDimension.scoreRole ?? "—"}</dd></div>
                    <div><dt>Formula</dt><dd>{selectedDimension.scoreFormula ?? "—"}</dd></div>
                    <div><dt>Normalization</dt><dd>{selectedDimension.scoreNormalization ?? "—"}</dd></div>
                    <div><dt>Contribution</dt><dd>{selectedDimension.scoreContribution === null || selectedDimension.scoreContribution === undefined ? "Unavailable" : `${selectedDimension.scoreContribution}`}</dd></div>
                    <div><dt>Source</dt><dd>{selectedDimension.sourceLabel ?? "—"}</dd></div>
                  </dl>
                )}
                {selectedDimension?.definition && <p>{selectedDimension.definition}</p>}
              </aside>
            </div>
            <aside className={styles.scoreSummary} aria-labelledby="recovery-score-summary-title">
              <RecoveryScorePopover hrv={scoreDriver(drivers, "hrv")} restingHeartRate={scoreDriver(drivers, "restingHeartRate")} sleep={scoreDriver(drivers, "sleep")}>
                <span id="recovery-score-summary-title" className={styles.summaryLabel}>Recovery score</span>
                <span className={styles.summaryValue} aria-label={`Recovery score: ${scoreText(score)} out of 100`}><strong>{scoreText(score)}</strong><span>/100</span></span>
                <span className={styles.summaryAverage}>30-day avg · {scoreText(averages.recovery)} /100</span>
              </RecoveryScorePopover>
              <div className={styles.summaryRail} aria-hidden="true"><span style={{ transform: `scaleX(${score === null ? 0 : Math.min(1, Math.max(0, score / 100))})` }} /></div>
            </aside>
          </section>

          <section className={`${styles.section} health-observatory-panel`} data-recovery-scroll-reveal="true" aria-label="Recent recovery signals">
            <div className={styles.signalRows}>
              {[
                { label: "HRV", value: latest.hrv_ms, average: signalAverages.hrv, unit: "ms", decimals: 0 },
                { label: "Resting heart rate", value: latest.resting_heart_rate, average: signalAverages.restingHeartRate, unit: "bpm", decimals: 0 },
                { label: "Respiratory rate", value: latest.respiratory_rate, average: signalAverages.respiratoryRate, unit: "rpm", decimals: 1 },
              ].map((signal) => <div className={styles.signalRow} key={signal.label}><span>{signal.label}</span><div><strong>{formatValue(signal.value, signal.decimals)}</strong>{signal.value === null ? null : <small>{signal.unit}</small>}<em>30-day avg · {signal.average.value === null ? "—" : `${formatAverage(signal.average.value, "decimal", signal.decimals)} ${signal.unit}`}</em></div></div>)}
            </div>
          </section>

          <section className={`${styles.section} ${styles.trendsSection} health-observatory-panel`} data-recovery-scroll-reveal="true" aria-label="Recovery trends over 30 days">
            <div className={styles.trendGrid}>
              {visibleTrendKeys.map((key) => <MetricTrendCard key={key} label={trendLabels[key].label} unit={trendLabels[key].unit} points={points(data.days, key)} direction={directionMap[trendLabels[key].direction]} format={(value) => value.toFixed(1)} valueFormat="decimal" chartType="bar" compact averageInChart animateCurrent animationFormat="decimal" />)}
            </div>
          </section>

          <section className={`${styles.section} health-observatory-panel`} data-recovery-scroll-reveal="true" aria-label="Heart-rate zones, daily average of measured days">
            <div className={styles.zonesHeading}><span>Heart-rate zones</span><span className={styles.sectionDate}>{weeklyZones.startDate && weeklyZones.endDate ? `${formatCivilDate(weeklyZones.startDate)} – ${formatCivilDate(weeklyZones.endDate)}` : "—"}</span></div>
            <WeeklyZoneChart summary={weeklyZones} />
          </section>
        </> : <section className={`${styles.empty} health-observatory-panel health-observatory-empty`} data-recovery-scroll-reveal="true" aria-labelledby="recovery-empty-heading"><span className={styles.emptyMark} aria-hidden="true">+</span><div><h2 id="recovery-empty-heading">No recovery data</h2><p>0 measured days over the last 30 days. Import your signals from a connected health source, then return here.</p><p><a className={styles.emptyAction} href="/settings">Check your health connection</a></p></div></section>}
      </section>
    </HealthPageShell>
  </div>;
}
