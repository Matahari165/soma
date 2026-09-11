import type { PersonalLabJournal, PersonalLabOverview, PersonalLabSnapshot } from "@/services/personal-lab";

import { MatrixDisclosure, TimeScaleSummary } from "./correlation-matrix";
import { MetricRegistry } from "./metric-registry";
import { PersonalLabJournalWorkspace } from "./personal-lab-journal-workspace";
import { NarrativeRefresh } from "./narrative-refresh";
import { PersonalLabMetrics } from "./today-signals";

export function PersonalLabOverviewSection({ data, connectionNotice = null }: { data: PersonalLabOverview; connectionNotice?: "health" | "calendar" | null }) {
  return <>
    {connectionNotice && <div className="lab-notice" role="status">{connectionNotice === "calendar" ? "Google Calendar connected." : "Google Health connected. Import in progress."}</div>}
    <header className="lab-header lab-entry__section lab-entry__header">
      <div className="lab-header__row">
        <h1>Personal Lab</h1>
        <div className="lab-header__signals">
          <PersonalLabMetrics data={{ ...data.today, overnightFingerprint: data.overnightFingerprint }} />
        </div>
      </div>
    </header>
  </>;
}

export function PersonalLabJournalSection({ data, analysis = null }: { data: PersonalLabJournal; analysis?: PersonalLabSnapshot | null }) {
  return (
    <div className="lab-workspace lab-entry__section lab-entry__journal">
      <PersonalLabJournalWorkspace data={data} analysis={analysis} />
    </div>
  );
}

export function PersonalLabAnalysisSection({ data, refreshNarrative = true }: { data: PersonalLabSnapshot; refreshNarrative?: boolean }) {
  return <>
    <NarrativeRefresh enabled={refreshNarrative && data.needsNarrativeRefresh} />
    <div className="lab-entry__section lab-entry__insight"><TimeScaleSummary matrix={data.matrix} narrative={data.aiNarrative} /></div>
    <div className="lab-entry__section lab-entry__relations"><MatrixDisclosure matrix={data.matrix} /></div>
    <div className="lab-entry__section lab-entry__registry"><MetricRegistry metrics={data.metricRegistry} /></div>
  </>;
}

export function PersonalLabOverviewLoading() {
  return <header className="lab-header lab-entry__section lab-entry__header lab-stream-loading" role="status" aria-live="polite" aria-label="Loading today's signals">
    <div className="lab-header__row">
      <h1>Personal Lab</h1>
      <span className="system-loading__status" aria-hidden="true"><i /><i /><i /></span>
    </div>
    <span className="sr-only">Loading today&apos;s signals…</span>
  </header>;
}

export function PersonalLabJournalLoading() {
  return <section className="lab-stream-placeholder lab-entry__section lab-entry__journal" role="status" aria-live="polite" aria-label="Loading daily workspace">
    <span className="eyebrow">Journal &amp; repas</span><strong>Preparing today</strong>
  </section>;
}

export function PersonalLabAnalysisLoading() {
  return <section className="lab-stream-placeholder lab-stream-placeholder--analysis lab-entry__section lab-entry__insight" role="status" aria-live="polite" aria-label="Loading analysis">
    <span className="eyebrow">Analysis</span><strong>Preparing signals</strong>
    <span className="system-loading__status" aria-hidden="true"><i /><i /><i /></span>
  </section>;
}
