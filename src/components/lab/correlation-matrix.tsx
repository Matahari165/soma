"use client";

import { Check, History, ThumbsUp, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { AnalysisPeriod, MatrixRelation } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

function signed(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function effectDigits(relation: MatrixRelation) {
  return ["bpm", "ms", "min", "count"].includes(relation.outcomeUnit) && Math.abs(relation.effect ?? 0) >= 1 ? 0 : 1;
}

function effectText(relation: MatrixRelation) {
  if (relation.effect === null) return "—";
  return `${signed(relation.effect, effectDigits(relation))}${relation.outcomeUnit ? ` ${relation.outcomeUnit}` : ""}`;
}

function percentText(relation: MatrixRelation) {
  return relation.percentEffect === null ? null : `${signed(relation.percentEffect, 1)}%`;
}

function probability(value: number) {
  return value < .001 ? "<.001" : value.toFixed(3);
}

function sourceText(relation: MatrixRelation) {
  return relation.coverageBySource.map((item) => `${item.source} ${item.pairedDays}`).join(" · ") || "No paired source";
}

function timingText(relation: MatrixRelation) {
  const sleepOutcome = ["sleep_minutes", "sleep_efficiency", "sleep_latency", "sleep_awake", "sleep_awakenings", "sleep_fragmentation", "deep_sleep", "rem_sleep", "light_sleep"].some((id) => relation.outcomeId.startsWith(id));
  if (relation.lagDays === 0) return sleepOutcome ? "that sleep episode" : "the same day";
  if (relation.lagDays === 1) return sleepOutcome ? "the following night" : "the next day";
  return "two days later";
}

function findingSentence(relation: MatrixRelation) {
  return `${relation.predictorLabel} (${relation.comparisonLabel}) is associated with ${effectText(relation)} in ${relation.outcomeLabel} ${timingText(relation)}.`;
}

function relationTone(relation: MatrixRelation, direction: "higher" | "lower" | "target") {
  if (relation.effect === null) return "is-neutral";
  if (direction === "higher") return relation.effect > 0 ? "is-positive" : "is-negative";
  if (direction === "lower") return relation.effect < 0 ? "is-positive" : "is-negative";
  if (relation.outcomeId === "sleep_minutes" && relation.baselineMean !== null && relation.comparisonMean !== null) {
    return Math.abs(relation.comparisonMean - 510) < Math.abs(relation.baselineMean - 510) ? "is-positive" : "is-negative";
  }
  return "is-neutral";
}

function periodLabel(period: AnalysisPeriod) {
  return period === "all" ? "All" : `${period}d`;
}

type RelationLocator = { predictor: string; outcome: string; period: AnalysisPeriod; lagDays: number };

function openRelation(locator: RelationLocator | undefined) {
  document.querySelector("#relations")?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (locator) window.dispatchEvent(new CustomEvent<RelationLocator>("soma:open-relation", { detail: locator }));
}

function RelationDetail({ relation, direction, onClose, detailRef }: { relation: MatrixRelation; direction: "higher" | "lower" | "target"; onClose: () => void; detailRef: RefObject<HTMLElement | null> }) {
  const maximum = Math.max(Math.abs(relation.baselineMean ?? 0), Math.abs(relation.comparisonMean ?? 0), 1);
  return <aside ref={detailRef} className="relation-detail" tabIndex={-1} aria-labelledby="relation-detail-title">
    <header>
      <div><span className="section-kicker">Relation detail</span><h3 id="relation-detail-title">{relation.predictorLabel} × {relation.outcomeLabel}</h3></div>
      <button type="button" className="icon-button" aria-label="Close relation detail" onClick={onClose}><X size={17} /></button>
    </header>
    <p className="relation-detail__finding">{findingSentence(relation)}</p>
    <div className="relation-detail__plot" aria-label="Compared outcome means">
      <div><span>Baseline</span><i style={{ width: `${Math.abs(relation.baselineMean ?? 0) / maximum * 100}%` }} /><strong>{relation.baselineMean ?? "—"} {relation.outcomeUnit}</strong></div>
      <div><span>{relation.comparisonLabel}</span><i className={relationTone(relation, direction)} style={{ width: `${Math.abs(relation.comparisonMean ?? 0) / maximum * 100}%` }} /><strong>{relation.comparisonMean ?? "—"} {relation.outcomeUnit}</strong></div>
    </div>
    <dl>
      <div><dt>Effect</dt><dd>{percentText(relation) ? `${percentText(relation)} · ` : ""}{effectText(relation)}</dd></div>
      <div><dt>95% CI</dt><dd>{relation.effectConfidenceLow === null ? "—" : `${signed(relation.effectConfidenceLow, effectDigits(relation))} to ${signed(relation.effectConfidenceHigh ?? 0, effectDigits(relation))} ${relation.outcomeUnit}`}</dd></div>
      <div><dt>Groups</dt><dd>{relation.baselineCount} baseline · {relation.comparisonCount} comparison</dd></div>
      <div><dt>Tests</dt><dd>p {probability(relation.pValue)} · q {probability(relation.qValue)}</dd></div>
      <div><dt>Period</dt><dd>{relation.period === "all" ? "All history" : `${relation.period} days`}</dd></div>
      <div><dt>Lag</dt><dd>{timingText(relation)}</dd></div>
      <div><dt>Source</dt><dd>{sourceText(relation)}</dd></div>
      {relation.predictorKind === "numeric" && !relation.comparisonLabel.includes("avg vs 0") && <div><dt>Association</dt><dd>Monotonic coefficient {signed(relation.coefficient ?? 0, 2)}</dd></div>}
      <div><dt>Method</dt><dd>Raw within-person comparison · serial-dependence robust · BH corrected</dd></div>
    </dl>
  </aside>;
}

export function TimeScaleSummary({ matrix, narrative }: { matrix: PersonalLabSnapshot["matrix"]; narrative: PersonalLabSnapshot["aiNarrative"] }) {
  const [liked, setLiked] = useState(Boolean(narrative?.isCurrent && narrative.liked));
  const [historyLikes, setHistoryLikes] = useState<Record<string, boolean>>(() => Object.fromEntries((narrative?.history ?? []).map((item) => [item.id, item.liked])));
  const [historyOpen, setHistoryOpen] = useState(false);
  const lines = narrative?.highlights ?? [];
  async function saveLike(id: string, next: boolean) {
    return fetch("/api/lab/insights/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, liked: next }) });
  }
  async function likeCurrent() {
    if (!narrative?.id) return;
    const next = !liked;
    setLiked(next);
    const response = await saveLike(narrative.id, next);
    if (!response.ok) setLiked(!next);
  }
  async function likeHistory(id: string) {
    const previous = historyLikes[id] ?? false;
    setHistoryLikes((current) => ({ ...current, [id]: !previous }));
    const response = await saveLike(id, !previous);
    if (!response.ok) setHistoryLikes((current) => ({ ...current, [id]: previous }));
  }
  return <section className="lab-insight-panel" aria-labelledby="lab-insight-title">
    <header><div><span className="section-kicker">Morning analysis</span><h2 id="lab-insight-title">{narrative?.isCurrent ? narrative.headline : "Waiting for overnight data."}</h2></div>
      <div className="lab-insight-actions">
        {narrative?.isCurrent && narrative.id && <button type="button" aria-pressed={liked} onClick={() => void likeCurrent()}><ThumbsUp size={15} fill={liked ? "currentColor" : "none"} /> Like</button>}
        {(narrative?.history?.length ?? 0) > 0 && <button type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen((current) => !current)}><History size={15} /> History</button>}
      </div>
    </header>
    {lines.length > 0 && <ol>{lines.slice(0, 4).map((line, index) => <li key={line}><span>{String(index + 1).padStart(2, "0")}</span><button type="button" className="lab-insight-link" onClick={() => openRelation(narrative?.sourceFacts[index])}>{line}</button></li>)}</ol>}
    {historyOpen && narrative?.history && <div className="lab-insight-history">{narrative.history.map((item) => <article key={item.id}>
      <header><time>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(item.generatedAt))}</time><button type="button" className="lab-insight-history__like" aria-label={`${historyLikes[item.id] ? "Unlike" : "Like"} insight from ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(item.generatedAt))}`} aria-pressed={historyLikes[item.id] ?? false} onClick={() => void likeHistory(item.id)}><ThumbsUp size={14} fill={historyLikes[item.id] ? "currentColor" : "none"} /></button></header>
      <button type="button" className="lab-insight-link lab-insight-history__headline" onClick={() => openRelation(item.sourceFacts[0])}><strong>{item.headline}</strong></button>
      {item.summary && <p>{item.summary}</p>}
      {item.highlights.length > 0 && <ol>{item.highlights.map((highlight, index) => <li key={`${item.id}-${index}`}><button type="button" className="lab-insight-link" onClick={() => openRelation(item.sourceFacts[index])}>{highlight}</button></li>)}</ol>}
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
  const [selected, setSelected] = useState<MatrixRelation | null>(null);
  const relationDetailRef = useRef<HTMLElement | null>(null);
  const outcomes = matrix.outcomes;
  const rows = useMemo(() => (rowsByPeriod[period] ?? []).filter((row) => row.period === period)
    .filter((row) => showNonSignificant
      ? row.relations.some((relation) => !relation.excluded)
      : row.relations.some((relation) => relation.featureEligible && relation.qValue < .05)), [rowsByPeriod, period, showNonSignificant]);

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
    setSelected(null);
    setLoadError(false);
    await loadPeriod(nextPeriod);
  }

  useEffect(() => {
    const listener = (event: Event) => {
      const locator = (event as CustomEvent<RelationLocator>).detail;
      setPeriod(locator.period);
      setSelected(null);
      setLoadError(false);
      void loadPeriod(locator.period).then((loadedRows) => {
        const relation = loadedRows.flatMap((row) => row.relations)
          .find((candidate) => candidate.predictorLabel === locator.predictor && candidate.outcomeLabel === locator.outcome && candidate.lagDays === locator.lagDays);
        setSelected(relation ?? null);
      });
    };
    window.addEventListener("soma:open-relation", listener);
    return () => window.removeEventListener("soma:open-relation", listener);
  }, [loadPeriod]);

  useEffect(() => {
    if (!selected) return;
    window.requestAnimationFrame(() => relationDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [selected]);

  return <section id="relations" className="matrix-section" aria-labelledby="matrix-title">
    <header className="matrix-header">
      <div><h2 id="matrix-title">Relationship matrix</h2></div>
      <div className="matrix-controls">
        <div className="matrix-periods" role="group" aria-label="Analysis period">{matrix.periods.map((value) => <button type="button" aria-pressed={period === value} disabled={loadingPeriod !== null} onClick={() => void selectPeriod(value)} key={value}>{periodLabel(value)}</button>)}</div>
        <label className="matrix-toggle"><input type="checkbox" checked={showNonSignificant} onChange={(event) => setShowNonSignificant(event.target.checked)} /><span><Check size={12} /> Show non-significant</span></label>
      </div>
    </header>
    <div className="matrix-scroll" role="region" aria-label="Scrollable relationship matrix" tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Influence</th>{outcomes.map((outcome) => <th scope="col" key={outcome.id}><span>{outcome.label}</span><small>{outcome.unit}</small></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><th scope="row"><strong>{row.emoji && <span aria-hidden="true">{row.emoji}</span>}{row.label}</strong><small>{row.lagLabel}</small></th>{row.relations.map((relation, index) => {
          const significant = relation.featureEligible && relation.qValue < .05;
          const outcome = outcomes[index];
          return <td className={significant ? relationTone(relation, outcome.direction) : "is-non-significant"} key={relation.outcomeId}>
            {!significant && !showNonSignificant ? <span className="matrix-empty">—</span> : relation.coefficient === null ? <span className="matrix-empty" title={relation.exclusionReasons[0]}>n={relation.sampleSize}</span> : <button type="button" onClick={() => setSelected(relation)} aria-label={`Open ${relation.predictorLabel} and ${relation.outcomeLabel} detail`}>
              <strong>{percentText(relation) ? `${percentText(relation)} · ${effectText(relation)}` : effectText(relation)}</strong>
              <small>{relation.comparisonLabel}</small>
              {!significant && <em>ns</em>}
            </button>}
          </td>;
        })}</tr>)}</tbody>
      </table>
      {loadingPeriod === period && <p className="matrix-no-results" role="status">Loading relationships…</p>}
      {loadError && loadingPeriod === null && <p className="matrix-no-results" role="alert">Relationships could not be loaded. Select the period to retry.</p>}
      {!rows.length && loadingPeriod !== period && !loadError && <p className="matrix-no-results">{showNonSignificant ? "No calculable relation in this window." : "No q < 0.05 relation in this window."}</p>}
    </div>
    {selected && <RelationDetail relation={selected} direction={outcomes.find((outcome) => outcome.id === selected.outcomeId)?.direction ?? "target"} onClose={() => setSelected(null)} detailRef={relationDetailRef} />}
    <details className="matrix-method"><summary>Method</summary><p>Each cell is a raw within-person comparison over the selected rolling window. Blank values are omitted pair by pair. Boolean and exposure comparisons need at least five days in each group; continuous measures need ten paired days. Two-sided p values use serial-dependence-robust intervals, then Benjamini–Hochberg correction across the visible analysis family. The default table keeps only q &lt; 0.05.</p></details>
  </section>;
}
