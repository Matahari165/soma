"use client";

import { ArrowRight, Check, ThumbsUp, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import { PRACTICAL_EFFECT_THRESHOLDS, selectMeaningfulRelations, type AnalysisPeriod, type MatrixRelation } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { effectText, percentText, RelationDetail, relationTone, shortTimingText } from "./relation-detail";
import { calculableRelations, compareInfluenceGroups, groupMatrixRows, influenceGroup, significantRelations } from "./relationship-groups";

export function periodLabel(period: AnalysisPeriod) {
  return period === "all" ? "All" : `${period}d`;
}

/** Keep programmatic scrolling consistent with the user's motion preference. */
export function matrixScrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function scrollToMatrixElement(element: Element | null) {
  element?.scrollIntoView({ behavior: matrixScrollBehavior(), block: "start" });
}

type RelationLocator = { predictor: string; outcome: string; period: AnalysisPeriod; lagDays: number };

function openRelation(locator: RelationLocator | undefined) {
  scrollToMatrixElement(document.querySelector("#relations"));
  if (locator) window.dispatchEvent(new CustomEvent<RelationLocator>("soma:open-relation", { detail: locator }));
}

function effectDirection(relation: MatrixRelation, direction: "higher" | "lower" | "target") {
  return relationTone(relation, direction) === "is-positive" ? 1 : relationTone(relation, direction) === "is-negative" ? -1 : 0;
}

export function matrixCellEffectText(relation: MatrixRelation) {
  return relation.outcomeUnit === "%" ? effectText(relation) : percentText(relation) ?? effectText(relation);
}

export function daysUntilFirstResult(relations: MatrixRelation[]) {
  const eligible = relations.filter((relation) => !relation.excluded);
  if (!eligible.length || eligible.some((relation) => relation.coefficient !== null)) return null;
  const remaining = Math.min(...eligible.map((relation) => relation.minimumDaysRemaining ?? 0));
  return remaining > 0 ? remaining : 0;
}

export type MatrixCellState = "collecting" | "no-signal" | "excluded" | null;

export function matrixCellState(relations: MatrixRelation[], displayed: MatrixRelation[]): MatrixCellState {
  if (displayed.length) return null;
  const eligible = relations.filter((relation) => !relation.excluded);
  if (!eligible.length) return "excluded";
  if (!eligible.some((relation) => relation.coefficient !== null)
    && eligible.some((relation) => (relation.minimumDaysRemaining ?? 0) > 0)) return "collecting";
  return "no-signal";
}

function cellProgress(relations: MatrixRelation[]) {
  const eligible = relations.filter((relation) => !relation.excluded);
  const closest = [...eligible].sort((first, second) => (first.minimumDaysRemaining ?? 0) - (second.minimumDaysRemaining ?? 0))[0];
  if (!closest) return 0;
  const required = closest.sampleSize + (closest.minimumDaysRemaining ?? 0);
  return required ? Math.min(1, closest.sampleSize / required) : 0;
}

function MatrixStateMark({ state, progress = 0, labelled = false }: { state: Exclude<MatrixCellState, null>; progress?: number; labelled?: boolean }) {
  const labels = { collecting: "Collecting data", "no-signal": "Enough data, no clear signal", excluded: "Not applicable" };
  return <span
    className={`matrix-state matrix-state--${state}`}
    aria-hidden={labelled ? undefined : true}
    aria-label={labelled ? labels[state] : undefined}
    role={labelled ? "img" : undefined}
    style={state === "collecting" ? { "--matrix-state-progress": `${Math.round(progress * 360)}deg` } as CSSProperties : undefined}
  />;
}

function matrixRelationTone(relation: MatrixRelation) {
  const value = relation.outcomeUnit === "%" ? relation.effect : relation.percentEffect;
  if (value === null || value === 0) return "is-neutral";
  return value > 0 ? "is-positive" : "is-negative";
}

/** Matrix cells only expose delayed timing when it exists; same-day timing needs no badge. */
export function matrixTimingLabel(lagDays: number) {
  return lagDays > 0 ? `J+${lagDays}` : null;
}

export type InfluenceExplanation = {
  definition: string;
  calculation: string;
  source: "Google Health" | "Journal" | "Soma";
  sourceDetail: string;
};

const influenceExplanations: Record<string, Omit<InfluenceExplanation, "sourceDetail"> & { sourceDetail?: string }> = {
  bedtime: {
    definition: "The local clock time when the sleep episode starts.",
    calculation: "Soma converts the clock time to minutes and uses a fixed 30-minute contrast when comparing relationships.",
    source: "Google Health",
    sourceDetail: "Recorded by your connected wearable and imported through Google Health.",
  },
  wake_time: {
    definition: "The local clock time when the sleep episode ends.",
    calculation: "Soma converts the clock time to minutes and compares the observed personal range across eligible days.",
    source: "Google Health",
    sourceDetail: "Recorded by your connected wearable and imported through Google Health.",
  },
  sleep_regularity: {
    definition: "How closely tonight's bedtime and wake time follow your recent sleep schedule.",
    calculation: "Soma compares both times with the circular average of the previous 13 recorded nights and expresses the result as a percentage.",
    source: "Soma",
    sourceDetail: "Calculated by Soma from bedtime and wake-time episodes imported through Google Health.",
  },
  sleep_debt: {
    definition: "Accumulated sleep shortfall across the recent sleep window.",
    calculation: "Soma adds each day's gap between estimated sleep need and actual sleep, keeping only positive shortfalls from the recent window.",
    source: "Soma",
    sourceDetail: "Calculated by Soma from sleep duration and estimated sleep need based on Google Health data.",
  },
  steps: {
    definition: "The total number of steps recorded during the day.",
    calculation: "The daily total is used as received; Soma does not turn it into a separate score before the relationship analysis.",
    source: "Google Health",
    sourceDetail: "Collected by your connected wearable and imported through Google Health.",
  },
  zone_minutes: {
    definition: "Time spent in the wearable's heart-rate activity zones during the day.",
    calculation: "The daily minutes are summed from the zone records supplied by Google Health.",
    source: "Google Health",
    sourceDetail: "Collected by your connected wearable and imported through Google Health.",
  },
  intense_minutes: {
    definition: "Time spent in the vigorous and peak heart-rate zones.",
    calculation: "Soma combines vigorous-zone minutes and peak-zone minutes into one daily indicator.",
    source: "Soma",
    sourceDetail: "Calculated by Soma from heart-rate zones imported through Google Health.",
  },
  active_minutes: {
    definition: "The total time classified as active by the wearable.",
    calculation: "The daily active-minute total is used as received in the relationship analysis.",
    source: "Google Health",
    sourceDetail: "Collected by your connected wearable and imported through Google Health.",
  },
  exercise_minutes: {
    definition: "The total duration of recorded exercise during the day.",
    calculation: "The daily exercise-minute total is used as received in the relationship analysis.",
    source: "Google Health",
    sourceDetail: "Collected by your connected wearable and imported through Google Health.",
  },
  sedentary_minutes: {
    definition: "The number of minutes spent sedentary during the day.",
    calculation: "The daily sedentary-minute total is used as received; missing days remain missing.",
    source: "Google Health",
    sourceDetail: "Collected by your connected wearable and imported through Google Health.",
  },
  active_day: {
    definition: "Whether the day counts as active: yes or no.",
    calculation: "Soma marks a day active when it has at least 7,500 steps, or 20 active-zone minutes, or 30 active minutes; it compares active and non-active days.",
    source: "Soma",
    sourceDetail: "Calculated by Soma from daily activity measures imported through Google Health.",
  },
  running_distance: {
    definition: "The distance covered during recorded running sessions.",
    calculation: "The day's running distance is used in kilometres; days without a recorded run remain missing.",
    source: "Google Health",
    sourceDetail: "Collected by your connected wearable and imported through Google Health.",
  },
  running_pace: {
    definition: "The average pace of recorded running sessions.",
    calculation: "Soma uses the day's running pace in seconds per kilometre; a lower value means a faster pace.",
    source: "Google Health",
    sourceDetail: "Collected by your connected wearable and imported through Google Health.",
  },
  running_average_heart_rate: {
    definition: "The average heart rate during recorded running sessions.",
    calculation: "The day's running average is used in beats per minute and compared with the observed personal range.",
    source: "Google Health",
    sourceDetail: "Collected by your connected wearable and imported through Google Health.",
  },
  vo2_max: {
    definition: "An estimate of the maximum amount of oxygen your body can use during exercise.",
    calculation: "The daily VO₂ max estimate is used as received in the relationship analysis.",
    source: "Google Health",
    sourceDetail: "Collected by your connected wearable and imported through Google Health.",
  },
  effort: {
    definition: "Soma's daily estimate of accomplished activity load.",
    calculation: "Soma combines available zone minutes, exercise minutes, active energy, and steps with diminishing returns, then normalizes the result to a 0–100 score.",
    source: "Soma",
    sourceDetail: "Calculated by Soma from available activity measures imported through Google Health.",
  },
};

export function influenceExplanation(predictorId: string, label: string): InfluenceExplanation {
  const known = influenceExplanations[predictorId];
  if (known) return { ...known, sourceDetail: known.sourceDetail ?? `Provided by ${known.source}.` };
  if (predictorId.startsWith("journal:")) {
    return {
      definition: `${label} is a personal measure that you record in the daily Journal.`,
      calculation: "Soma uses the value from each validated day; numeric measures use an observed personal contrast and yes/no measures compare their recorded groups.",
      source: "Journal",
      sourceDetail: "Recorded by you in the Journal. Blank values remain missing and are not treated as zero.",
    };
  }
  return {
    definition: `${label} is a daily measure available as a possible influence on the selected outcomes.`,
    calculation: "Soma uses the daily value as recorded and tests its eligible same-day, next-day, and two-days-later relationships.",
    source: "Google Health",
    sourceDetail: "Collected by your connected wearable and imported through Google Health.",
  };
}

function InfluenceDetail({ explanation, label, onClose, detailRef }: { explanation: InfluenceExplanation; label: string; onClose: () => void; detailRef: RefObject<HTMLElement | null> }) {
  return <aside id="influence-detail" ref={detailRef} className="influence-detail" tabIndex={-1} aria-labelledby="influence-detail-title">
    <header>
      <div><span className="influence-detail__eyebrow">Influence</span><h3 id="influence-detail-title">{label}</h3></div>
      <button type="button" className="icon-button" aria-label={`Close ${label} explanation`} onClick={onClose}><X size={17} /></button>
    </header>
    <dl>
      <div><dt>What it measures</dt><dd>{explanation.definition}</dd></div>
      <div><dt>How it is calculated</dt><dd>{explanation.calculation}</dd></div>
      <div><dt>Where it comes from</dt><dd><strong>{explanation.source}</strong><span>{explanation.sourceDetail}</span></dd></div>
    </dl>
  </aside>;
}

const outcomeThemeById: Record<string, string> = {
  sleep_minutes: "Sleep",
  sleep_efficiency: "Sleep",
  sleep_latency: "Sleep",
  sleep_awake: "Sleep",
  sleep_awakenings: "Sleep",
  sleep_fragmentation: "Sleep",
  deep_sleep: "Sleep",
  rem_sleep: "Sleep",
  hrv: "Cardio & recovery",
  rhr: "Cardio & recovery",
  recovery: "Cardio & recovery",
  vo2_max: "Cardio & recovery",
  running_average_heart_rate: "Running performance",
  running_pace: "Running performance",
  respiratory: "Breathing & oxygen",
  spo2: "Breathing & oxygen",
};
const outcomeThemeOrder = ["Sleep", "Cardio & recovery", "Running performance", "Breathing & oxygen", "Other"];

export function groupOutcomeThemes(outcomes: PersonalLabSnapshot["matrix"]["outcomes"]) {
  return outcomes.reduce<Array<{ label: string; count: number }>>((groups, outcome) => {
    const label = outcomeThemeById[outcome.id] ?? "Other";
    const previous = groups.at(-1);
    if (previous?.label === label) previous.count += 1;
    else groups.push({ label, count: 1 });
    return groups;
  }, []);
}

function StrongestEffects({ relations, outcomes, onSelect }: {
  relations: MatrixRelation[];
  outcomes: PersonalLabSnapshot["matrix"]["outcomes"];
  onSelect: (relation: MatrixRelation) => void;
}) {
  const meaningful = useMemo(() => selectMeaningfulRelations(relations, relations.length), [relations]);
  const meaningfulGroups = useMemo(() => {
    const groups = new Map<string, MatrixRelation[]>();
    for (const relation of meaningful) groups.set(influenceGroup(relation.predictorId), [...(groups.get(influenceGroup(relation.predictorId)) ?? []), relation]);
    return [...groups].sort(([first], [second]) => compareInfluenceGroups(first, second));
  }, [meaningful]);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const [visibleRows, setVisibleRows] = useState<Set<string>>(() => new Set());
  const setRowRef = useCallback((key: string, node: HTMLLIElement | null) => {
    if (node) rowRefs.current.set(key, node);
    else rowRefs.current.delete(key);
  }, []);
  useEffect(() => {
    const rows = meaningful.map((relation) => `${relation.period}:${relation.predictorId}:${relation.outcomeId}:${relation.lagDays}`);
    if (!rows.length) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      rowRefs.current.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    const rowKeys = new Set(rows);
    const observer = new IntersectionObserver((entries) => {
      const entered = entries.filter((entry) => entry.isIntersecting)
        .map((entry) => entry.target.getAttribute("data-matrix-effect-key"))
        .filter((key): key is string => key !== null && rowKeys.has(key));
      if (!entered.length) return;

      setVisibleRows((current) => {
        const next = new Set(current);
        entered.forEach((key) => next.add(key));
        return next;
      });
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => observer.unobserve(entry.target));
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

    rowRefs.current.forEach((node, key) => {
      if (rowKeys.has(key)) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [meaningful]);

  return <section className="strongest-effects" aria-labelledby="strongest-effects-title">
    <header>
      <div><h3 id="strongest-effects-title">Strongest effects</h3><p>Only q &lt; 0.05 effects above a practical threshold.</p></div>
      <div className="strongest-effects__axis" aria-hidden="true"><span>Less favourable</span><span>More favourable</span></div>
    </header>
    {!meaningful.length ? <p className="strongest-effects__empty" role="status">No relationship in this period is both statistically reliable and large enough to be practically meaningful.</p> : meaningfulGroups.map(([group, groupRelations]) => <section className="strongest-effects__group" aria-labelledby={`strongest-${group.replaceAll(" ", "-").toLowerCase()}`} key={group}>
      <h4 id={`strongest-${group.replaceAll(" ", "-").toLowerCase()}`}>{group}</h4>
      <ol>{groupRelations.map((relation) => {
        const index = meaningful.indexOf(relation);
        const direction = outcomes.find((outcome) => outcome.id === relation.outcomeId)?.direction ?? "target";
        const sign = effectDirection(relation, direction);
        const point = Math.max(-1, Math.min(1, sign * relation.practicalRatio / 4));
        const standardizedEffect = Math.sign(relation.effect ?? 0) * relation.practicalRatio * .2;
        const uncertainty = PRACTICAL_EFFECT_THRESHOLDS[relation.outcomeId] === undefined
          ? Math.max(Math.abs(standardizedEffect - relation.confidenceLow), Math.abs(relation.confidenceHigh - standardizedEffect)) / .2 / 4
          : relation.effectConfidenceLow === null || relation.effectConfidenceHigh === null || relation.effect === null
            ? 0
            : Math.max(Math.abs(relation.effect - relation.effectConfidenceLow), Math.abs(relation.effectConfidenceHigh - relation.effect)) / relation.practicalThreshold / 4;
        const low = Math.max(-1, point - uncertainty);
        const high = Math.min(1, point + uncertainty);
        const rowKey = `${relation.period}:${relation.predictorId}:${relation.outcomeId}:${relation.lagDays}`;
        const intervalOrigin = low >= 0 ? "left" : high <= 0 ? "right" : "center";
        const rowStyle = { "--matrix-row-delay": `${index * 56}ms` } as CSSProperties;
        const intervalStyle = {
          left: `${50 + low * 46}%`,
          width: `${Math.max(1, (high - low) * 46)}%`,
          "--matrix-interval-origin": intervalOrigin,
        } as CSSProperties;
        return <li
          className={visibleRows.has(rowKey) ? "strongest-effects__row is-visible" : "strongest-effects__row"}
          data-matrix-effect-key={rowKey}
          key={rowKey}
          ref={(node) => setRowRef(rowKey, node)}
          style={rowStyle}
        >
          <button type="button" onClick={() => onSelect(relation)} aria-label={`Open ${relation.predictorLabel} and ${relation.outcomeLabel}: ${effectText(relation)}, ${shortTimingText(relation)}`}>
            <span className="strongest-effects__relation"><strong>{relation.predictorLabel}</strong><small>{relation.comparisonLabel} · {shortTimingText(relation)}</small></span>
            <span className="strongest-effects__plot" aria-hidden="true">
              <i className="strongest-effects__zero" />
              <i className="strongest-effects__interval" style={intervalStyle} />
              <i className="strongest-effects__point" style={{ left: `${50 + point * 46}%` }} />
            </span>
            <span className="strongest-effects__outcome"><strong>{relation.outcomeLabel}</strong><small>{effectText(relation)}</small></span>
          </button>
        </li>;
      })}</ol>
    </section>)}
  </section>;
}

function InsightCopy({ value }: { value: string }) {
  const [label, ...detailParts] = value.split("\n");
  const detail = detailParts.join(" ");
  return detail ? <span className="lab-insight-copy"><strong>{label}</strong><span>{detail}</span></span> : <>{value}</>;
}

export function TimeScaleSummary({ matrix, narrative }: { matrix: PersonalLabSnapshot["matrix"]; narrative: PersonalLabSnapshot["aiNarrative"] }) {
  const [historyLikes, setHistoryLikes] = useState<Record<string, boolean>>(() => Object.fromEntries((narrative?.history ?? []).map((item) => [item.id, item.liked])));
  const [historyOpen, setHistoryOpen] = useState(false);
  const lines = narrative?.highlights ?? [];
  async function saveLike(id: string, next: boolean) {
    return fetch("/api/lab/insights/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, liked: next }) });
  }
  async function likeHistory(id: string) {
    const previous = historyLikes[id] ?? false;
    setHistoryLikes((current) => ({ ...current, [id]: !previous }));
    const response = await saveLike(id, !previous);
    if (!response.ok) setHistoryLikes((current) => ({ ...current, [id]: previous }));
  }
  const hasHistory = (narrative?.history?.length ?? 0) > 0;
  const insightTitle = narrative?.isCurrent ? narrative.headline : "Waiting for overnight data.";
  return <section className="lab-insight-panel" aria-labelledby="lab-insight-title">
    <header>
      <h2 id="lab-insight-title">{hasHistory ? <button type="button" className="lab-insight-header-trigger" aria-expanded={historyOpen} aria-controls="lab-insight-history" onClick={() => setHistoryOpen((current) => !current)}>{insightTitle}</button> : insightTitle}</h2>
    </header>
    {narrative?.isCurrent && narrative.summary && <p>{narrative.summary}</p>}
    {lines.length > 0 && <ol aria-label="Insights">{lines.slice(0, 4).map((line, index) => <li key={line}><span aria-hidden="true"><ArrowRight size={16} /></span><button type="button" className="lab-insight-link" aria-label={`Open insight ${index + 1}: ${line.replace("\n", ". ")}`} onClick={() => openRelation(narrative?.sourceFacts[index])}><InsightCopy value={line} /></button></li>)}</ol>}
    {historyOpen && narrative?.history && <div id="lab-insight-history" className="lab-insight-history">{narrative.history.map((item) => <article key={item.id}>
      <header><time>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(item.generatedAt))}</time><button type="button" className="lab-insight-history__like" aria-label={`${historyLikes[item.id] ? "Unlike" : "Like"} insight from ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(item.generatedAt))}`} aria-pressed={historyLikes[item.id] ?? false} onClick={() => void likeHistory(item.id)}><ThumbsUp size={14} fill={historyLikes[item.id] ? "currentColor" : "none"} /></button></header>
      <button type="button" className="lab-insight-link lab-insight-history__headline" onClick={() => openRelation(item.sourceFacts[0])}><strong>{item.headline}</strong></button>
      {item.summary && <p>{item.summary}</p>}
      {item.highlights.length > 0 && <ol>{item.highlights.map((highlight, index) => <li key={`${item.id}-${index}`}><button type="button" className="lab-insight-link" onClick={() => openRelation(item.sourceFacts[index])}><InsightCopy value={highlight} /></button></li>)}</ol>}
    </article>)}</div>}
    {!narrative && matrix.topRelations.length === 0 && <span className="sr-only">No significant relation is available yet.</span>}
  </section>;
}

export function CorrelationMatrix({ matrix }: { matrix: PersonalLabSnapshot["matrix"] }) {
  const [period, setPeriod] = useState<AnalysisPeriod>(30);
  const [rowsByPeriod, setRowsByPeriod] = useState<Partial<Record<AnalysisPeriod, PersonalLabSnapshot["matrix"]["rows"]>>>(() => ({ 30: matrix.rows }));
  const [loadingPeriod, setLoadingPeriod] = useState<AnalysisPeriod | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showNonSignificant, setShowNonSignificant] = useState(false);
  const [selected, setSelected] = useState<MatrixRelation[] | null>(null);
  const [selectedInfluence, setSelectedInfluence] = useState<{ id: string; label: string } | null>(null);
  const [periodAnimationSequence, setPeriodAnimationSequence] = useState(0);
  const relationDetailRef = useRef<HTMLElement | null>(null);
  const influenceDetailRef = useRef<HTMLElement | null>(null);
  const outcomes = useMemo(() => [...matrix.outcomes].sort((left, right) => {
    const leftTheme = outcomeThemeById[left.id] ?? "Other";
    const rightTheme = outcomeThemeById[right.id] ?? "Other";
    return outcomeThemeOrder.indexOf(leftTheme) - outcomeThemeOrder.indexOf(rightTheme);
  }), [matrix.outcomes]);
  const outcomeThemes = useMemo(() => groupOutcomeThemes(outcomes), [outcomes]);
  const periodRows = useMemo(() => (rowsByPeriod[period] ?? []).filter((row) => row.period === period), [rowsByPeriod, period]);
  const rows = useMemo(() => groupMatrixRows(periodRows, outcomes.map((outcome) => outcome.id)), [outcomes, periodRows]);

  const loadPeriod = useCallback(async (nextPeriod: AnalysisPeriod) => {
    const cached = rowsByPeriod[nextPeriod];
    if (cached) return cached;
    setLoadingPeriod(nextPeriod);
    try {
      const response = await fetch(`/api/lab/matrix?period=${nextPeriod}`);
      if (!response.ok) throw new Error("Matrix request failed");
      const result = await response.json() as { rows: PersonalLabSnapshot["matrix"]["rows"] };
      setRowsByPeriod((current) => ({ ...current, [nextPeriod]: result.rows }));
      return result.rows;
    } catch {
      setLoadError(true);
      return [];
    } finally {
      setLoadingPeriod(null);
    }
  }, [rowsByPeriod]);

  async function selectPeriod(nextPeriod: AnalysisPeriod) {
    setPeriod(nextPeriod);
    setPeriodAnimationSequence((current) => current + 1);
    setSelected(null);
    setSelectedInfluence(null);
    setLoadError(false);
    await loadPeriod(nextPeriod);
  }

  useEffect(() => {
    const listener = (event: Event) => {
      const locator = (event as CustomEvent<RelationLocator>).detail;
      setPeriod(locator.period);
      setPeriodAnimationSequence((current) => current + 1);
      setSelected(null);
      setSelectedInfluence(null);
      setLoadError(false);
      void loadPeriod(locator.period).then((loadedRows) => {
        const relation = loadedRows.flatMap((row) => row.relations)
          .find((candidate) => candidate.predictorLabel === locator.predictor && candidate.outcomeLabel === locator.outcome && candidate.lagDays === locator.lagDays);
        if (!relation) return setSelected(null);
        setSelected(calculableRelations(loadedRows.flatMap((row) => row.relations).filter((candidate) => candidate.predictorId === relation.predictorId && candidate.outcomeId === relation.outcomeId)));
      });
    };
    window.addEventListener("soma:open-relation", listener);
    return () => window.removeEventListener("soma:open-relation", listener);
  }, [loadPeriod]);

  useEffect(() => {
    if (!selected) return;
    window.requestAnimationFrame(() => {
      relationDetailRef.current?.focus();
      scrollToMatrixElement(relationDetailRef.current);
    });
  }, [selected]);

  useEffect(() => {
    if (!selectedInfluence) return;
    window.requestAnimationFrame(() => {
      influenceDetailRef.current?.focus();
      scrollToMatrixElement(influenceDetailRef.current);
    });
  }, [selectedInfluence]);

  function selectInfluence(row: { id: string; label: string }) {
    setSelected(null);
    setSelectedInfluence((current) => current?.id === row.id ? null : row);
  }

  return <section id="relations" className="matrix-section" aria-labelledby="matrix-title">
    <header className="matrix-header">
      <div><h2 id="matrix-title">Relationship matrix</h2></div>
      <div className="matrix-controls">
        <div
          className="matrix-periods"
          role="group"
          aria-label="Analysis period"
          style={{ "--matrix-period-index": Math.max(0, matrix.periods.indexOf(period)), "--matrix-period-count": Math.max(1, matrix.periods.length) } as CSSProperties}
        >
          {matrix.periods.map((value) => <button type="button" aria-pressed={period === value} disabled={loadingPeriod !== null} onClick={() => void selectPeriod(value)} key={value}>{periodLabel(value)}</button>)}
        </div>
        <div className="matrix-legend" aria-label="Cell states">
          <span><MatrixStateMark state="collecting" progress={.58} /><small>Collecting</small></span>
          <span><MatrixStateMark state="no-signal" /><small>No clear signal</small></span>
          <span><MatrixStateMark state="excluded" /><small>Not applicable</small></span>
        </div>
        <label className="matrix-toggle"><input type="checkbox" checked={showNonSignificant} onChange={(event) => setShowNonSignificant(event.target.checked)} /><span><Check size={12} /> Show non-significant</span></label>
      </div>
    </header>
    <StrongestEffects relations={periodRows.flatMap((row) => row.relations)} outcomes={outcomes} onSelect={(relation) => { setSelectedInfluence(null); setSelected(calculableRelations(periodRows.flatMap((row) => row.relations).filter((candidate) => candidate.predictorId === relation.predictorId && candidate.outcomeId === relation.outcomeId))); }} key={periodAnimationSequence} />
    <div className="matrix-scroll" role="region" aria-label="Scrollable relationship matrix" tabIndex={0}>
      <table>
        <thead>
          <tr className="matrix-theme-row"><th scope="col" rowSpan={2}>Influence</th>{outcomeThemes.map((theme, index) => <th scope="colgroup" colSpan={theme.count} key={`${theme.label}-${index}`}>{theme.label}</th>)}</tr>
          <tr className="matrix-outcome-row">{outcomes.map((outcome) => <th scope="col" key={outcome.id}><span>{outcome.label}</span><small>{outcome.unit}</small></th>)}</tr>
        </thead>
        <tbody>{rows.map((row, rowIndex) => <Fragment key={row.id}>{(rowIndex === 0 || rows[rowIndex - 1].group !== row.group) && <tr className="matrix-group-row"><th colSpan={outcomes.length + 1}>{row.group}</th></tr>}<tr><th scope="row"><button type="button" className="matrix-influence-trigger" aria-expanded={selectedInfluence?.id === row.id} aria-controls={selectedInfluence?.id === row.id ? "influence-detail" : undefined} onClick={() => selectInfluence(row)}><strong>{row.emoji && <span aria-hidden="true">{row.emoji}</span>}{row.label}</strong></button></th>{row.relationsByOutcome.map((relations, index) => {
          const calculable = calculableRelations(relations);
          const significant = significantRelations(relations);
          const displayed = showNonSignificant ? calculable : significant;
          const outcome = outcomes[index];
          const tones = new Set(significant.map(matrixRelationTone));
          const tone = !significant.length ? "is-non-significant" : tones.size === 1 ? [...tones][0] : "is-mixed";
          const state = matrixCellState(relations, displayed);
          return <td className={`${tone}${state ? ` has-state has-state--${state}` : ""}`} key={outcome.id}>
            {!displayed.length && state ? <span className="matrix-empty"><MatrixStateMark state={state} progress={cellProgress(relations)} labelled /><span className="sr-only"> for {row.label} and {outcome.label}</span></span> : <button type="button" onClick={() => { setSelectedInfluence(null); setSelected(calculable); }} aria-label={`Open ${row.label} and ${outcome.label} detail`}>
              {displayed.map((relation) => <span className={`matrix-effect-line ${matrixRelationTone(relation)}`} key={relation.lagDays}><strong>{matrixCellEffectText(relation)}</strong>{matrixTimingLabel(relation.lagDays) && <small>{matrixTimingLabel(relation.lagDays)}</small>}</span>)}
            </button>}
          </td>;
        })}</tr></Fragment>)}</tbody>
      </table>
      {loadingPeriod === period && <p className="matrix-no-results" role="status">Loading relationships…</p>}
      {loadError && loadingPeriod === null && <p className="matrix-no-results" role="alert">Relationships could not be loaded. Select the period to retry.</p>}
      {!rows.length && loadingPeriod !== period && !loadError && <p className="matrix-no-results">{showNonSignificant ? "No calculable relation in this window." : "No q < 0.05 relation in this window."}</p>}
    </div>
    {selectedInfluence && <InfluenceDetail explanation={influenceExplanation(selectedInfluence.id, selectedInfluence.label)} label={selectedInfluence.label} onClose={() => setSelectedInfluence(null)} detailRef={influenceDetailRef} />}
    {selected?.length && <RelationDetail relations={selected} direction={outcomes.find((outcome) => outcome.id === selected[0].outcomeId)?.direction ?? "target"} onClose={() => setSelected(null)} detailRef={relationDetailRef} />}
    <details className="matrix-method"><summary>Method</summary><p>Each variable appears once. Its cells group same-day, next-day and two-days-later results when those timings are possible. Daytime behavior is never paired with an overnight outcome that happened earlier. Blank values are omitted pair by pair. Boolean and exposure comparisons need at least five days in each group; continuous measures need ten paired days. With at least 30 paired days, every numeric relation also tests a threshold, plateau and middle zone against a straight line, retaining a non-linear shape only when it improves the fit materially. Amounts use every recorded day, including zero-amount days. Two-sided p values use serial-dependence-robust intervals, then Benjamini–Hochberg correction. The default table keeps only q &lt; 0.05.</p></details>
  </section>;
}
