import type { HealthAnalytics, HealthMetricDay } from "@/services/health-analytics";

import { HealthPageShell } from "./health-page-shell";
import { HeartRateCurve, ZoneDistribution } from "./health-charts";
import { MetricTrendCard } from "./metric-trend-card";

const points = (days: HealthMetricDay[], key: keyof HealthMetricDay) => days.map((day) => ({ date: day.metric_date, value: typeof day[key] === "number" ? day[key] as number : null }));

export function RecoveryDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.at(-1);
  const score = data.scores.filter((item) => item.kind === "recovery").at(-1)?.score ?? null;
  const heartRates = data.heartRateSamples.map((sample) => sample.bpm);
  const heartMinimum = heartRates.length ? Math.min(...heartRates) : null;
  const heartMaximum = heartRates.length ? Math.max(...heartRates) : null;
  const heartAverage = heartRates.length ? heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length : null;
  return <HealthPageShell eyebrow="Latest complete physiology" title="Recovery" description="See what changed, how durable it looks, and how today compares with your own 7, 30 and 90-day history." score={score} scoreLabel="Recovery score">
    {latest ? <>
      <section className="health-primary-grid" aria-label="Latest recovery signals">
        <article className="health-primary-card health-primary-card--featured"><span>HRV</span><strong>{latest.hrv_ms === null ? "—" : `${Math.round(latest.hrv_ms)} ms`}</strong><p>Daily RMSSD compared with your personal baseline.</p></article>
        <article className="health-primary-card"><span>Resting heart rate</span><strong>{latest.resting_heart_rate === null ? "—" : `${Math.round(latest.resting_heart_rate)} bpm`}</strong><p>Lower or higher is interpreted relative to your own history.</p></article>
        <article className="health-primary-card"><span>Nightly SpO₂</span><strong>{latest.oxygen_saturation === null ? "—" : `${latest.oxygen_saturation.toFixed(1)}%`}</strong><p>{latest.oxygen_saturation_lower === null || latest.oxygen_saturation_upper === null ? "Nightly range unavailable." : `${latest.oxygen_saturation_lower.toFixed(1)}–${latest.oxygen_saturation_upper.toFixed(1)}% reported range.`}</p></article>
        <article className="health-primary-card"><span>Respiration</span><strong>{latest.respiratory_rate === null ? "—" : `${latest.respiratory_rate.toFixed(1)}/min`}</strong><p>Nightly rate compared with recent readings.</p></article>
        <article className="health-primary-card"><span>Temperature delta</span><strong>{latest.skin_temperature_delta === null ? "—" : `${latest.skin_temperature_delta > 0 ? "+" : ""}${latest.skin_temperature_delta.toFixed(2)} °C`}</strong><p>Nightly temperature minus your 30-day baseline.</p></article>
        <article className="health-primary-card"><span>Heart-rate range</span><strong>{heartMinimum === null || heartMaximum === null ? "—" : `${heartMinimum}–${heartMaximum}`}</strong><p>{heartAverage === null ? "Samples unavailable." : `${Math.round(heartAverage)} bpm average across recent samples.`}</p></article>
      </section>

      <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Recent samples</span><h2>Heart rate through the day</h2></div><span className="quality-pill">{data.heartRateSamples.length} samples</span></div><HeartRateCurve samples={data.heartRateSamples} /></section>
      <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Latest complete day</span><h2>Time in heart-rate zones</h2></div></div><ZoneDistribution zones={[
        { label: "Light", minutes: latest.light_zone_minutes, tone: "light" }, { label: "Moderate", minutes: latest.moderate_zone_minutes, tone: "moderate" }, { label: "Vigorous", minutes: latest.vigorous_zone_minutes, tone: "vigorous" }, { label: "Peak", minutes: latest.peak_zone_minutes, tone: "peak" },
      ]} /></section>

      <section className="metric-trend-grid" aria-label="Physiology trends">
        <MetricTrendCard label="HRV" points={points(data.days, "hrv_ms")} unit="ms" direction="higher_is_better" description="Sustained changes use three recent readings against a 14–30 day baseline." />
        <MetricTrendCard label="Resting heart rate" points={points(data.days, "resting_heart_rate")} unit="bpm" direction="lower_is_better" description="Interpreted against your baseline rather than a generic population target." />
        <MetricTrendCard label="SpO₂" points={points(data.days, "oxygen_saturation")} unit="%" direction="context_only" description="A wellness trend only; isolated values are not interpreted diagnostically." />
        <MetricTrendCard label="Respiration" points={points(data.days, "respiratory_rate")} unit="/min" direction="context_only" description="Durable movement is more informative than a single night." />
        <MetricTrendCard label="Temperature delta" points={points(data.days, "skin_temperature_delta")} unit="°C" direction="context_only" description="Centered on your own nightly baseline." />
        <MetricTrendCard label="VO₂ max" points={points(data.days, "vo2_max")} unit="ml/kg/min" direction="higher_is_better" description="Shown only when the device and activity support the estimate." />
        <MetricTrendCard label="Core temperature" points={points(data.days, "core_body_temperature_celsius")} unit="°C" direction="context_only" description="A separately recorded core measurement, not the wearable skin-temperature delta." />
        <MetricTrendCard label="Blood glucose" points={points(data.days, "blood_glucose_mg_dl")} unit="mg/dL" direction="context_only" description="Shown as recorded context only, without diagnostic interpretation." />
      </section>
    </> : <section className="health-panel health-empty">Wear your device overnight and sync Google Health to build your personal baseline.</section>}
  </HealthPageShell>;
}
