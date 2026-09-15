import { useEffect, useRef, useState, type RefObject } from "react";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import type { HealthAnalytics, HealthMetricDay, ScoreDay } from "@/services/health-analytics";

import { averageLast30Measured, formatAverage, latestSourceMeasuredAt, measuredCoverage, metricTone } from "./health-metric-utils";
import { HealthPageShell } from "./health-page-shell";
import { MetricTrendCard } from "./metric-trend-card";
import { RecoveryRadar, type RecoveryRadarDimension } from "./recovery-radar";
import { RecoveryScorePopover } from "./recovery-score-popover";
import { RecoveryScrollReveal } from "./recovery-scroll-reveal";
import styles from "./recovery-redesign.module.css";

type TrendKind = "hrv_daily" | "hrv_nightly" | "resting_heart_rate" | "respiratory_rate";
type ZoneKey = "light_zone_minutes" | "moderate_zone_minutes" | "vigorous_zone_minutes" | "peak_zone_minutes";
type ZoneTone = "light" | "moderate" | "vigorous" | "peak";

const trendLabels: Record<TrendKind, { label: string; unit: string; direction: "higher" | "lower" | "context" }> = {
  hrv_daily: { label: "Variabilité cardiaque", unit: "ms", direction: "higher" },
  hrv_nightly: { label: "VFC nocturne", unit: "ms", direction: "higher" },
  resting_heart_rate: { label: "FC au repos", unit: "bpm", direction: "lower" },
  respiratory_rate: { label: "Fréquence respiratoire", unit: "rpm", direction: "context" },
};

const metricKeys: Record<TrendKind, keyof HealthMetricDay> = {
  hrv_daily: "hrv_ms",
  hrv_nightly: "hrv_ms",
  resting_heart_rate: "resting_heart_rate",
  respiratory_rate: "respiratory_rate",
};

const zoneDefinitions: Array<{ key: ZoneKey; label: string; tone: ZoneTone }> = [
  { key: "light_zone_minutes", label: "Légère", tone: "light" },
  { key: "moderate_zone_minutes", label: "Modérée", tone: "moderate" },
  { key: "vigorous_zone_minutes", label: "Vigoureuse", tone: "vigorous" },
  { key: "peak_zone_minutes", label: "Pic", tone: "peak" },
];

const directionMap: Record<string, "higher_is_better" | "lower_is_better" | "context_only"> = {
  higher: "higher_is_better",
  lower: "lower_is_better",
  context: "context_only",
};

const visibleTrendKeys: TrendKind[] = ["hrv_daily", "hrv_nightly", "resting_heart_rate", "respiratory_rate"];

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
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(civilDate(value)).replace(".", "");
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
  const valueText = (minutes: number | null) => minutes === null || !Number.isFinite(minutes) ? "—" : `${Math.round(minutes)} min/j`;
  const description = `Moyenne quotidienne des zones cardiaques, semaine du ${summary.startDate ? formatCivilDate(summary.startDate) : "—"} au ${summary.endDate ? formatCivilDate(summary.endDate) : "—"} : ${summary.zones.map((zone) => `${zone.label} ${valueText(zone.minutes)}, ${zone.measuredDays} jour${zone.measuredDays > 1 ? "s" : ""} mesuré${zone.measuredDays > 1 ? "s" : ""}`).join(" ; ")}.`;
  return <div className={styles.weeklyZones}>
    <div className={styles.zoneBar} role="img" aria-label={description}>
      {measuredZones.filter((zone) => (zone.minutes ?? 0) > 0).map((zone) => <span key={zone.label} className={`${styles.zoneSegment} ${styles[`zoneSegment--${zone.tone}`]}`} style={{ width: `${total ? ((zone.minutes ?? 0) / total) * 100 : 0}%` }} />)}
    </div>
    <p className="sr-only">{description}</p>
    <ul className={styles.zoneLegend}>{summary.zones.map((zone) => <li key={zone.label}><span className={zoneDotClassName(zone.tone)} /> <span>{zone.label}</span><strong>{valueText(zone.minutes)}</strong></li>)}</ul>
  </div>;
}

function scoreText(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : Math.round(value).toLocaleString("fr-FR");
}

function dimensionValueText(score: number | null) {
  return score === null || !Number.isFinite(score) ? "—" : `${formatValue(score)} /100`;
}

const DETAIL_ID = "recovery-radar-detail";
const DETAIL_TITLE_ID = "recovery-radar-detail-title";

function DetailCloseButton({ label, onClose, closeButtonRef, tabIndex }: { label: string; onClose: () => void; closeButtonRef: RefObject<HTMLButtonElement | null>; tabIndex: number }) {
  return <button
    aria-label={`Fermer les détails de ${label}`}
    className={styles.recoveryDetailClose}
    onClick={onClose}
    ref={closeButtonRef}
    tabIndex={tabIndex}
    type="button"
  >Fermer</button>;
}

function DimensionDetail({ dimension }: { dimension: RecoveryRadarDimension | null }) {
  if (!dimension) return null;

  return <>
    <dl className={styles.recoveryDimensionMetrics}>
      <div><dt>Valeur actuelle</dt><dd>{dimensionValueText(dimension.score)}</dd></div>
      <div><dt>Moy. 30 j</dt><dd>Indisponible</dd></div>
      <div><dt>Sens de lecture</dt><dd>{dimension.readingDirection || "—"}</dd></div>
      <div className={styles.recoveryDimensionRole}><dt>Rôle</dt><dd>{dimension.scoreRole || "—"}</dd></div>
    </dl>
    <dl className={styles.recoveryRuleMetrics}>
      <div><dt>Formule</dt><dd>Comparaison avec votre référence personnelle.</dd></div>
      <div><dt>Contribution</dt><dd>Indisponible</dd></div>
    </dl>
  </>;
}

const freshnessLabels = {
  current: "Actuel",
  partial: "Partiel",
  stale: "Obsolète",
  missing: "Indisponible",
} as const;

export function RecoveryDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.findLast(hasRecoveryMeasurement);
  const recoveryScore = data.scores.findLast((item) => item.kind === "recovery" && item.score_date === latest?.metric_date);
  const score = recoveryScore?.score ?? null;
  const averages = {
    hrv: latest ? averageLast30Measured(data.days, "hrv_ms", latest.metric_date) : null,
    restingHeartRate: latest ? averageLast30Measured(data.days, "resting_heart_rate", latest.metric_date) : null,
    respiratoryRate: latest ? averageLast30Measured(data.days, "respiratory_rate", latest.metric_date) : null,
    recovery: averageLast30Scores(data.scores, "recovery", latest?.metric_date),
  };
  const drivers = recoveryScore?.drivers;
  const driverCoverage = Number(drivers?.coverage);
  const coverage = Number.isFinite(driverCoverage)
    ? Math.min(1, Math.max(0, driverCoverage))
    : latest ? measuredCoverage([latest.hrv_ms, latest.resting_heart_rate, latest.sleep_minutes]) : 0;
  const freshness = calculateSignalFreshness({ measuredAt: latestSourceMeasuredAt(latest), importedAt: data.importedAt, coverage });
  const heroScoreTone = metricTone(score, averages.recovery, "higher_is_better");
  const weeklyZones = averageWeeklyZoneMinutes(data.days, latest?.metric_date);
  const dimensions: RecoveryRadarDimension[] = [
    { key: "hrv", label: "VFC nocturne", score: scoreDriver(drivers, "hrv"), weight: 40, readingDirection: "Plus élevé = meilleur", scoreRole: "Composante du score Récupération · 40 %" },
    { key: "restingHeartRate", label: "FC au repos", score: scoreDriver(drivers, "restingHeartRate"), weight: 30, readingDirection: "Plus faible = meilleur", scoreRole: "Composante du score Récupération · 30 %" },
    { key: "sleep", label: "Sommeil", score: scoreDriver(drivers, "sleep"), weight: 30, readingDirection: "Plus élevé = meilleur", scoreRole: "Composante du score Récupération · 30 %" },
  ];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailCloseButtonRef = useRef<HTMLButtonElement>(null);
  const radarButtonRefs = useRef<Record<string, SVGGElement | null>>({});
  const selectedDimension = selectedKey ? dimensions.find((dimension) => dimension.key === selectedKey) ?? null : null;
  const detailOpen = selectedKey !== null;

  useEffect(() => {
    if (selectedKey) detailHeadingRef.current?.focus({ preventScroll: true });
  }, [selectedKey]);

  useEffect(() => {
    if (!selectedKey) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDetail();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  // `closeDetail` intentionally reads the current selected trigger from the closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  function restoreFocus(key: string) {
    const restore = () => {
      radarButtonRefs.current[key]?.focus();
    };
    if (typeof window === "undefined") restore();
    else window.requestAnimationFrame(restore);
  }

  function closeDetail() {
    if (!selectedKey) return;
    const key = selectedKey;
    setSelectedKey(null);
    restoreFocus(key);
  }

  function selectDimension(key: string) {
    if (selectedKey === key) closeDetail();
    else setSelectedKey(key);
  }
  const recoveryScoreAction = latest ? <RecoveryScorePopover score={score} hrv={scoreDriver(drivers, "hrv")} restingHeartRate={scoreDriver(drivers, "restingHeartRate")} sleep={scoreDriver(drivers, "sleep")} /> : undefined;
  const freshnessLabel = freshnessLabels[freshness.state];

  return <div className={styles.page}>
    <HealthPageShell
      kind="recovery"
      title="Récupération"
      description="Score de récupération, facteurs personnels et signaux de santé."
      score={score}
      freshness={freshness}
      timezone={data.timezone}
      heroScore={<span className="sr-only">Score de récupération : {scoreText(score)} sur 100. Moyenne sur 30 jours : {scoreText(averages.recovery)} sur 100.</span>}
    >
      <main className={`${styles.content} health-observatory-content`} data-recovery-scroll-reveal-root="true">
        <RecoveryScrollReveal />
        {latest ? <>
          <section className={`${styles.heroScene} health-observatory-panel`} data-recovery-scroll-reveal="true" aria-labelledby="recovery-score-summary-title">
            <div className={styles.recoveryRadarStage} data-detail-open={detailOpen}>
              <div className={styles.radarRegion}>
                <h2 className="sr-only">Facteurs du score</h2>
                <RecoveryRadar
                  dimensions={dimensions}
                  detailId={DETAIL_ID}
                  interactive
                  onSelect={selectDimension}
                  registerButton={(key, node) => { radarButtonRefs.current[key] = node; }}
                  selectedId={selectedKey}
                />
              </div>
              <aside
                aria-hidden={!detailOpen}
                aria-labelledby={DETAIL_TITLE_ID}
                className={styles.recoveryDetailPanel}
                data-open={detailOpen}
                id={DETAIL_ID}
              >
                <div className={styles.recoveryDetailHeader}>
                  <h3 id={DETAIL_TITLE_ID} ref={detailHeadingRef} tabIndex={-1}>{selectedDimension?.label ?? "Détail de la récupération"}</h3>
                  <DetailCloseButton closeButtonRef={detailCloseButtonRef} label={selectedDimension?.label ?? "récupération"} onClose={closeDetail} tabIndex={detailOpen ? 0 : -1} />
                </div>
                <DimensionDetail dimension={selectedDimension} />
              </aside>
            </div>
            <aside className={styles.scoreSummary} aria-labelledby="recovery-score-summary-title">
              <span className={styles.summaryKicker}>Aujourd’hui</span>
              <h2 id="recovery-score-summary-title">Score de récupération</h2>
              <div className={styles.summaryValue} aria-label={`Score de récupération : ${scoreText(score)} sur 100`}><strong>{scoreText(score)}</strong><span>/100</span></div>
              <div className={`${styles.summaryRail} metric-tone--${heroScoreTone}`} aria-hidden="true"><span style={{ width: score === null ? "0%" : `${Math.min(100, Math.max(0, score))}%` }} /></div>
              <dl className={styles.summaryFacts}>
                <div><dt>État</dt><dd>{freshnessLabel}</dd></div>
                <div><dt>Couverture</dt><dd>{Math.round(coverage * 100)} %</dd></div>
                <div><dt>Moyenne · 30 j</dt><dd>{scoreText(averages.recovery)}<span>/100</span></dd></div>
              </dl>
              {recoveryScoreAction ? <div className={styles.summaryAction}>{recoveryScoreAction}</div> : null}
            </aside>
          </section>

          <section className={`${styles.section} health-observatory-panel`} data-recovery-scroll-reveal="true" aria-labelledby="latest-signals-heading">
            <header className={styles.sectionHeader}><h2 id="latest-signals-heading">Signaux récents</h2><span>{formatCivilDate(latest.metric_date)}</span></header>
            <div className={styles.signalRows}>
              {[
                { label: "VFC nocturne", value: latest.hrv_ms, average: averages.hrv, unit: "ms", decimals: 0 },
                { label: "FC au repos", value: latest.resting_heart_rate, average: averages.restingHeartRate, unit: "bpm", decimals: 0 },
                { label: "Fréquence respiratoire", value: latest.respiratory_rate, average: averages.respiratoryRate, unit: "rpm", decimals: 1 },
              ].map((signal) => <div className={styles.signalRow} key={signal.label}><span>{signal.label}</span><div><strong>{formatValue(signal.value, signal.decimals)}</strong>{signal.value === null ? null : <small>{signal.unit}</small>}<em>Moy. 30 j · {signal.average === null ? "—" : `${formatAverage(signal.average, "decimal", signal.decimals)} ${signal.unit}`}</em></div></div>)}
            </div>
          </section>

          <section className={`${styles.section} ${styles.trendsSection} health-observatory-panel`} data-recovery-scroll-reveal="true" aria-labelledby="recovery-trends-heading">
            <header className={styles.sectionHeader}><h2 id="recovery-trends-heading">Tendances</h2><span>30 jours</span></header>
            <div className={styles.trendGrid}>
              {visibleTrendKeys.map((key) => <MetricTrendCard key={key} label={trendLabels[key].label} unit={trendLabels[key].unit} points={points(data.days, key)} direction={directionMap[trendLabels[key].direction]} animateCurrent compact />)}
            </div>
          </section>

          <section className={`${styles.section} health-observatory-panel`} data-recovery-scroll-reveal="true" aria-labelledby="weekly-zones-heading">
            <header className={styles.sectionHeader}><h2 id="weekly-zones-heading">Zones cardiaques</h2><div className={styles.sectionHeaderMeta}><span className={styles.supporting}>Moyenne quotidienne · jours mesurés uniquement</span><span className={styles.sectionDate}>{weeklyZones.startDate && weeklyZones.endDate ? `${formatCivilDate(weeklyZones.startDate)} – ${formatCivilDate(weeklyZones.endDate)}` : "—"}</span></div></header>
            <WeeklyZoneChart summary={weeklyZones} />
          </section>
        </> : <section className={`${styles.empty} health-observatory-panel health-observatory-empty`} data-recovery-scroll-reveal="true" aria-labelledby="recovery-empty-heading"><span className={styles.emptyMark} aria-hidden="true">+</span><div><h2 id="recovery-empty-heading">Aucune donnée de récupération</h2><p>Synchronisez vos signaux de santé pour calculer une récupération personnalisée.</p></div></section>}
      </main>
    </HealthPageShell>
  </div>;
}
