import type { CSSProperties } from "react";

import {
  MEAL_BALANCE_COMPONENT_WEIGHTS,
  type MealBalanceComponentKey,
  type MealBalanceScore,
} from "@/domain/scores/meal-balance";

import styles from "./meal-score-overview.module.css";

export type MealScoreRolling = {
  days: 14 | 28;
  score: number | null;
  coveredDays: number;
  observedDays: number;
  totalDays: number;
};

export type MealScoreTrendPoint = { date: string; score: number | null };

export type MealScoreOverviewPanelProps = {
  daily: MealBalanceScore | null;
  rolling: readonly MealScoreRolling[];
  trend: readonly MealScoreTrendPoint[];
  className?: string;
};

const DIMENSION_KEYS: readonly MealBalanceComponentKey[] = [
  "variety",
  "foodQuality",
  "addedSugar",
  "sugarExposure",
  "ultraProcessing",
  "nutritionCoverage",
  "energy",
];

const DIMENSION_LABELS: Record<MealBalanceComponentKey, string> = {
  variety: "Variété",
  foodQuality: "Qualité alimentaire",
  addedSugar: "Sucre ajouté",
  sugarExposure: "Exposition liquide / concentrée",
  ultraProcessing: "Ultra-transformation",
  nutritionCoverage: "Couverture nutritionnelle",
  energy: "Énergie",
};

const EFFECT_LABELS = {
  positive: "Point positif",
  caution: "À surveiller",
  negative: "Point négatif",
} as const;

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)} %`;
}

function formatContribution(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(date: string, long = false) {
  const parsed = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("fr-FR", long
    ? { weekday: "long", day: "numeric", month: "long" }
    : { day: "numeric", month: "short" }).format(parsed).replace(".", "");
}

function scoreDescription(score: number | null) {
  return score === null ? "Score indisponible" : `Score ${formatScore(score)} sur 100`;
}

function componentFor(daily: MealBalanceScore | null, key: MealBalanceComponentKey) {
  return daily?.components.find((component) => component.key === key) ?? null;
}

function observationDescription(component: ReturnType<typeof componentFor>) {
  if (!component || component.score === null) return "Aucune observation exploitable";
  const observed = component.observedValue === null ? "valeur non détaillée" : String(component.observedValue);
  return `${observed} · ${formatPercent(component.observationCoverage)} observé · ${formatPercent(component.confidence)} confiance`;
}

function scoreBarStyle(score: number | null): CSSProperties | undefined {
  if (score === null || !Number.isFinite(score)) return undefined;
  const scale = score === 0 ? 0.02 : Math.min(Math.max(score, 0), 100) / 100;
  return { "--bar-scale": String(scale) } as CSSProperties;
}

function RollingWindow({ item }: { item: MealScoreRolling | undefined }) {
  if (!item) {
    return <li className={styles.rollingItem}><span className={styles.rollingLabel}>Fenêtre indisponible</span><strong className={styles.rollingScore}>—</strong><span>Aucune moyenne fournie</span></li>;
  }

  const scoreLabel = item.score === null ? "Score indisponible" : `Score ${formatScore(item.score)} sur 100`;
  return (
    <li className={styles.rollingItem} data-window={`${item.days}`}>
      <div className={styles.rollingHeading}>
        <span className={styles.rollingLabel}>{item.days} jours</span>
        <span className={styles.rollingCoverage}>{item.observedDays} / {item.totalDays} jours observés</span>
      </div>
      <strong className={styles.rollingScore} aria-label={scoreLabel}>{formatScore(item.score)}<span>/100</span></strong>
      <span className={styles.rollingDetail}>{item.coveredDays} / {item.totalDays} jours couverts</span>
    </li>
  );
}

function DimensionRow({ daily, keyName }: { daily: MealBalanceScore | null; keyName: MealBalanceComponentKey }) {
  const component = componentFor(daily, keyName);
  const score = component?.score ?? null;
  const weight = component?.weight ?? MEAL_BALANCE_COMPONENT_WEIGHTS[keyName];
  const summary = component?.summary ?? "Aucune observation exploitable pour cette dimension.";

  return (
    <li className={styles.dimensionRow} data-key={keyName} data-state={score === null ? "insufficient" : component?.status ?? "limited"}>
      <div className={styles.dimensionHeading}>
        <strong>{component?.label ?? DIMENSION_LABELS[keyName]}</strong>
      </div>
      <div className={styles.dimensionMetrics}>
        <span><small>Score</small><b>{formatScore(score)}<em>/100</em></b></span>
        <span><small>Poids</small><b>{weight} %</b></span>
        <span><small>Contribution</small><b>{score === null ? "—" : formatContribution(component?.contribution)}</b></span>
        <span className={styles.observation}><small>Observation / confiance</small><b>{observationDescription(component)}</b></span>
      </div>
      <p className={styles.dimensionSummary}>{summary}{component?.target ? ` Cible : ${component.target}.` : ""}</p>
    </li>
  );
}

export function MealScoreOverviewPanel({ daily, rolling, trend, className }: MealScoreOverviewPanelProps) {
  const dailyScore = daily?.score ?? null;
  const observedTrend = trend.filter((point) => point.score !== null && Number.isFinite(point.score));
  const rolling14 = rolling.find((item) => item.days === 14);
  const rolling28 = rolling.find((item) => item.days === 28);
  const chartDescription = trend.length
    ? trend.map((point) => point.score === null
      ? `${formatDate(point.date, true)} : aucun score, jour absent du tracé`
      : `${formatDate(point.date, true)} : score ${formatScore(point.score)} sur 100`).join(". ")
    : "Aucun jour disponible pour cette évolution.";

  return (
    <section className={[styles.root, className].filter(Boolean).join(" ")} aria-labelledby="meal-score-overview-title">
      <div className={styles.scoreTop} data-score-part="top" role="region" aria-labelledby="meal-score-overview-title">
        <header className={styles.sectionHeader}>
          <h2 id="meal-score-overview-title">Équilibre alimentaire</h2>
        </header>

        <div className={styles.overviewGrid}>
          <article className={styles.dailyPanel} aria-labelledby="meal-score-daily-title">
          <div className={styles.panelHeading}>
            <h3 id="meal-score-daily-title">Aujourd’hui</h3>
          </div>
          <strong className={styles.dailyScore} aria-label={scoreDescription(dailyScore)}>{formatScore(dailyScore)}<span>/100</span></strong>
          <div className={styles.scoreRail} aria-hidden="true">
            {dailyScore === null ? null : <span style={{ width: `${Math.min(Math.max(dailyScore, 0), 100)}%` }} />}
          </div>
          <dl className={styles.coverageList}>
            <div><dt>Couverture</dt><dd>{formatPercent(daily?.coverage)}</dd></div>
            <div><dt>Confiance</dt><dd>{formatPercent(daily?.confidence)}</dd></div>
          </dl>
          </article>

          <section className={styles.rollingPanel} aria-labelledby="meal-score-rolling-title">
          <div className={styles.panelHeading}>
            <h3 id="meal-score-rolling-title">Moyennes mobiles</h3>
          </div>
          <ul className={styles.rollingList}>
            <RollingWindow item={rolling14} />
            <RollingWindow item={rolling28} />
          </ul>
          </section>
        </div>

        <section className={styles.trendSection} aria-labelledby="meal-score-trend-title">
          <div className={styles.panelHeading}>
            <h3 id="meal-score-trend-title">Évolution du score</h3>
          </div>
          {observedTrend.length ? (
            <figure className={styles.chartFigure}>
              <div className={styles.chart} role="img" aria-labelledby="meal-score-trend-title" aria-describedby="meal-score-trend-description">
                <div className={styles.chartScale} aria-hidden="true"><span>100</span><span>50</span><span>0</span></div>
                <div className={styles.barChart} style={{ "--point-count": trend.length } as CSSProperties}>
                  {trend.map((point) => (
                    <div className={styles.barColumn} key={point.date}>
                      {point.score === null ? null : <span className={styles.bar} style={scoreBarStyle(point.score)} aria-hidden="true" />}
                    </div>
                  ))}
                </div>
              </div>
              <figcaption className={styles.chartCaption}>
                <span>{formatDate(trend[0].date)}</span><span>{formatDate(trend.at(-1)?.date ?? trend[0].date)}</span>
              </figcaption>
              <p id="meal-score-trend-description" className={styles.srOnly}>{chartDescription}. Les jours absents restent sans barre et ne sont pas comptés comme un score nul.</p>
            </figure>
          ) : <p className={styles.emptyInline}>Aucun historique de score disponible.</p>}
        </section>
      </div>

      <details className={styles.details} data-score-part="details" open>
        <summary>Détail des 7 dimensions</summary>
        <ul className={styles.dimensionList}>
          {DIMENSION_KEYS.map((keyName) => <DimensionRow daily={daily} key={keyName} keyName={keyName} />)}
        </ul>
      </details>

      <section className={styles.effectsSection} data-score-part="effects" aria-labelledby="meal-score-effects-title">
        <div className={styles.panelHeading}>
          <h3 id="meal-score-effects-title">Effets principaux</h3>
        </div>
        {daily?.strongestEffects.length ? (
          <ul className={styles.effectsList}>
            {daily.strongestEffects.map((effect) => (
              <li className={styles.effectRow} data-direction={effect.direction} key={effect.key}>
                <div className={styles.effectHeading}><span>{EFFECT_LABELS[effect.direction]}</span><strong>{effect.label}</strong></div>
                <b className={styles.effectScore}>{formatScore(effect.points)}<small>/100</small></b>
                <p>{effect.summary}</p>
              </li>
            ))}
          </ul>
        ) : <p className={styles.emptyInline}>Les effets principaux apparaîtront quand suffisamment de dimensions seront observées.</p>}
      </section>

    </section>
  );
}

export default MealScoreOverviewPanel;
