import { calculateSignalFreshness } from "@/domain/health/freshness";
import type { HealthAnalytics, HealthMetricDay } from "@/services/health-analytics";

import { HealthPageShell } from "./health-page-shell";
import { HeartRateCurve, ZoneDistribution } from "./health-charts";
import { AnimatedMetricReading } from "./animated-value";
import { averageLast30Measured, formatAverage, metricTone } from "./health-metric-utils";
import { MetricReading } from "./metric-reading";
import { MetricTrendCard } from "./metric-trend-card";
import { RecoveryScorePopover } from "./recovery-score-popover";

const points = (days: HealthMetricDay[], key: keyof HealthMetricDay) => days.map((day) => ({ date: day.metric_date, value: typeof day[key] === "number" ? day[key] as number : null }));

export function RecoveryDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.findLast((day) => (day.hrv_ms !== null && day.hrv_ms > 0) || (day.resting_heart_rate !== null && day.resting_heart_rate > 0));
  const recoveryScore = data.scores.findLast((item) => item.kind === "recovery" && item.score_date === latest?.metric_date);
  const score = recoveryScore?.score ?? null;
  const heartRates = data.heartRateSamples.map((sample) => sample.bpm);
  const heartMinimum = heartRates.length ? Math.min(...heartRates) : null;
  const heartMaximum = heartRates.length ? Math.max(...heartRates) : null;
  const averages = {
    hrv: latest ? averageLast30Measured(data.days, "hrv_ms", latest.metric_date) : null,
    restingHeartRate: latest ? averageLast30Measured(data.days, "resting_heart_rate", latest.metric_date) : null,
    oxygenSaturation: latest ? averageLast30Measured(data.days, "oxygen_saturation", latest.metric_date) : null,
    respiratoryRate: latest ? averageLast30Measured(data.days, "respiratory_rate", latest.metric_date) : null,
  };
  const tones = {
    hrv: metricTone(latest?.hrv_ms ?? null, averages.hrv, "higher_is_better"),
    restingHeartRate: metricTone(latest?.resting_heart_rate ?? null, averages.restingHeartRate, "lower_is_better"),
    oxygenSaturation: metricTone(latest?.oxygen_saturation ?? null, averages.oxygenSaturation, "higher_is_better"),
    respiratoryRate: "neutral" as const,
  };
  const recoveryMeasurements = latest ? ["daily-heart-rate-variability", "daily-resting-heart-rate"].map((type) => latest.source_freshness?.byType?.[type]).filter((value): value is string => Boolean(value)).sort() : [];
  const driverCoverage = Number(recoveryScore?.drivers?.coverage);
  const freshness = calculateSignalFreshness({ measuredAt: recoveryMeasurements.at(-1) ?? latest?.source_freshness?.latestMeasuredAt ?? latest?.metric_date, importedAt: data.importedAt, coverage: Number.isFinite(driverCoverage) ? driverCoverage : latest ? [latest.hrv_ms, latest.resting_heart_rate].filter((value) => value !== null).length / 3 : 0 });
  return <HealthPageShell kind="recovery" title="Recovery" description="The balance between strain, rest, and your recent physiology." score={score} freshness={freshness} timezone={data.timezone} heroScore={<RecoveryScorePopover score={score} hrv={typeof recoveryScore?.drivers?.hrv === "number" ? recoveryScore.drivers.hrv : null} restingHeartRate={typeof recoveryScore?.drivers?.restingHeartRate === "number" ? recoveryScore.drivers.restingHeartRate : null} sleep={typeof recoveryScore?.drivers?.sleep === "number" ? recoveryScore.drivers.sleep : null} />}>
    {latest ? <>
      <section className="health-primary-grid" aria-label="Latest recovery signals">
        <article className={`health-primary-card health-primary-card--featured health-primary-card--centered metric-tone--${tones.hrv}`}><span>HRV</span><AnimatedMetricReading value={latest.hrv_ms} format="number" decimals={0} unit={latest.hrv_ms === null ? undefined : "ms"} className={`metric-reading--${tones.hrv}`} /><p className="health-primary-card__average">30-day average · {formatAverage(averages.hrv, "decimal", 0)} ms</p></article>
        <article className={`health-primary-card health-primary-card--centered metric-tone--${tones.restingHeartRate}`}><span>Resting heart rate</span><AnimatedMetricReading value={latest.resting_heart_rate} format="number" decimals={0} unit={latest.resting_heart_rate === null ? undefined : "bpm"} className={`metric-reading--${tones.restingHeartRate}`} /><p className="health-primary-card__average">30-day average · {formatAverage(averages.restingHeartRate, "decimal", 0)} bpm</p></article>
        <article className="health-primary-card health-primary-card--centered"><span>Heart-rate range</span><MetricReading value={heartMinimum === null || heartMaximum === null ? "—" : `${heartMinimum}–${heartMaximum}`} unit={heartMinimum === null || heartMaximum === null ? undefined : "bpm"} /><p className="health-primary-card__average">30-day average unavailable</p></article>
        <article className={`health-primary-card health-primary-card--centered metric-tone--${tones.oxygenSaturation}`}><span>Nightly SpO₂</span><AnimatedMetricReading value={latest.oxygen_saturation} format="decimal" decimals={1} unit={latest.oxygen_saturation === null ? undefined : "%"} className={`metric-reading--${tones.oxygenSaturation}`} /><p className="health-primary-card__average">30-day average · {formatAverage(averages.oxygenSaturation, "decimal", 1)}%</p></article>
        <article className="health-primary-card health-primary-card--centered"><span>Respiration</span><AnimatedMetricReading value={latest.respiratory_rate} format="decimal" decimals={1} unit={latest.respiratory_rate === null ? undefined : "/min"} /><p className="health-primary-card__average">30-day average · {formatAverage(averages.respiratoryRate, "decimal", 1)} /min</p></article>
      </section>

      <section className="health-trends-block" aria-labelledby="recovery-trends-heading"><div className="health-section-heading"><div><span className="eyebrow">Last 30 days</span><h2 id="recovery-trends-heading">Recovery trends</h2></div></div><div className="metric-trend-grid">
        <MetricTrendCard label="HRV" points={points(data.days, "hrv_ms")} unit="ms" direction="higher_is_better" animateCurrent animationFormat="decimal" />
        <MetricTrendCard label="Resting heart rate" points={points(data.days, "resting_heart_rate")} unit="bpm" direction="lower_is_better" animateCurrent animationFormat="decimal" />
        <MetricTrendCard label="SpO₂" points={points(data.days, "oxygen_saturation")} unit="%" direction="context_only" animateCurrent animationFormat="decimal" />
        <MetricTrendCard label="Respiration" points={points(data.days, "respiratory_rate")} unit="/min" direction="context_only" animateCurrent animationFormat="decimal" />
        <MetricTrendCard label="Temperature delta" points={points(data.days, "skin_temperature_delta")} unit="°C" direction="context_only" animateCurrent animationFormat="decimal" />
      </div></section>

      <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Latest complete day</span><h2>Time in heart-rate zones</h2></div></div><ZoneDistribution zones={[
        { label: "Light", minutes: latest.light_zone_minutes, tone: "light" }, { label: "Moderate", minutes: latest.moderate_zone_minutes, tone: "moderate" }, { label: "Vigorous", minutes: latest.vigorous_zone_minutes, tone: "vigorous" }, { label: "Peak", minutes: latest.peak_zone_minutes, tone: "peak" },
      ]} /></section>

      <section className="health-panel health-panel--recent-samples"><div className="health-section-heading"><div><span className="eyebrow">Recent samples</span><h2>Heart rate through the day</h2></div><span className="quality-pill">{data.heartRateSamples.length} samples</span></div><HeartRateCurve samples={data.heartRateSamples} /></section>
    </> : <section className="health-panel health-empty"><div><h2>Recovery needs an overnight signal</h2><p>Sync HRV or resting heart rate to begin.</p></div></section>}
  </HealthPageShell>;
}
