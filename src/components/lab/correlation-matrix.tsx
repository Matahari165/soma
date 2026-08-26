"use client";

import { ArrowRight, Check, History, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AnalysisPeriod, MatrixRelation } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { effectText, percentText, RelationDetail, relationTone, shortTimingText } from "./relation-detail";
import { calculableRelations, groupMatrixRows, significantRelations } from "./relationship-groups";

function periodLabel(period: AnalysisPeriod) {
  return period === "all" ? "All" : `${period}d`;
}

type RelationLocator = { predictor: string; outcome: string; period: AnalysisPeriod; lagDays: number };

function openRelation(locator: RelationLocator | undefined) {
  document.querySelector("#relations")?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (locator) window.dispatchEvent(new CustomEvent<RelationLocator>("soma:open-relation", { detail: locator }));
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
    <header><div><h2 id="lab-insight-title">{narrative?.isCurrent ? narrative.headline : "Waiting for overnight data."}</h2></div>
      <div className="lab-insight-actions">
        {narrative?.isCurrent && narrative.id && <button type="button" aria-pressed={liked} onClick={() => void likeCurrent()}><ThumbsUp size={15} fill={liked ? "currentColor" : "none"} /> Like</button>}
        {(narrative?.history?.length ?? 0) > 0 && <button type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen((current) => !current)}><History size={15} /> History</button>}
      </div>
    </header>
    {lines.length > 0 && <ol aria-label="Recommendations">{lines.slice(0, 4).map((line, index) => <li key={line}><span aria-hidden="true"><ArrowRight size={16} /></span><button type="button" className="lab-insight-link" aria-label={`Open recommendation ${index + 1}: ${line}`} onClick={() => openRelation(narrative?.sourceFacts[index])}>{line}</button></li>)}</ol>}
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
  const [selected, setSelected] = useState<MatrixRelation[] | null>(null);
  const relationDetailRef = useRef<HTMLElement | null>(null);
  const outcomes = matrix.outcomes;
  const periodRows = useMemo(() => (rowsByPeriod[period] ?? []).filter((row) => row.period === period), [rowsByPeriod, period]);
  const rows = useMemo(() => groupMatrixRows(periodRows, outcomes.map((outcome) => outcome.id), showNonSignificant), [outcomes, periodRows, showNonSignificant]);

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
        if (!relation) return setSelected(null);
        setSelected(calculableRelations(loadedRows.flatMap((row) => row.relations).filter((candidate) => candidate.predictorId === relation.predictorId && candidate.outcomeId === relation.outcomeId)));
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
        <tbody>{rows.map((row) => <tr key={row.id}><th scope="row"><strong>{row.emoji && <span aria-hidden="true">{row.emoji}</span>}{row.label}</strong></th>{row.relationsByOutcome.map((relations, index) => {
          const calculable = calculableRelations(relations);
          const significant = significantRelations(relations);
          const displayed = showNonSignificant ? calculable : significant;
          const outcome = outcomes[index];
          const tones = new Set(significant.map((relation) => relationTone(relation, outcome.direction)));
          const tone = !significant.length ? "is-non-significant" : tones.size === 1 ? [...tones][0] : "is-mixed";
          const maximumSample = Math.max(0, ...relations.map((relation) => relation.sampleSize));
          return <td className={tone} key={outcome.id}>
            {!displayed.length ? <span className="matrix-empty">{showNonSignificant && maximumSample ? `n=${maximumSample}` : "—"}</span> : <button type="button" onClick={() => setSelected(calculable)} aria-label={`Open ${row.label} and ${outcome.label} detail for ${displayed.map(shortTimingText).join(" and ")}`}>
              {displayed.map((relation) => <span className="matrix-effect-line" key={relation.lagDays}><b>{shortTimingText(relation)}</b><strong>{percentText(relation) ? `${percentText(relation)} · ${effectText(relation)}` : effectText(relation)}</strong>{relation.qValue >= .05 && <em>ns</em>}</span>)}
              <small>{displayed[0]?.comparisonLabel}</small>
            </button>}
          </td>;
        })}</tr>)}</tbody>
      </table>
      {loadingPeriod === period && <p className="matrix-no-results" role="status">Loading relationships…</p>}
      {loadError && loadingPeriod === null && <p className="matrix-no-results" role="alert">Relationships could not be loaded. Select the period to retry.</p>}
      {!rows.length && loadingPeriod !== period && !loadError && <p className="matrix-no-results">{showNonSignificant ? "No calculable relation in this window." : "No q < 0.05 relation in this window."}</p>}
    </div>
    {selected?.length && <RelationDetail relations={selected} direction={outcomes.find((outcome) => outcome.id === selected[0].outcomeId)?.direction ?? "target"} onClose={() => setSelected(null)} detailRef={relationDetailRef} />}
    <details className="matrix-method"><summary>Method</summary><p>Each variable appears once. Its cells group same-day, next-day and two-days-later results when those timings are possible. Daytime behavior is never paired with an overnight outcome that happened earlier. Blank values are omitted pair by pair. Boolean and exposure comparisons need at least five days in each group; continuous measures need ten paired days. Amounts can also show a dose response among non-zero days. Two-sided p values use serial-dependence-robust intervals, then Benjamini–Hochberg correction. The default table keeps only q &lt; 0.05.</p></details>
  </section>;
}
