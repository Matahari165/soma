import type { PersonalLabJournal, PersonalLabOverview, PersonalLabSnapshot } from "@/services/personal-lab";

import { CorrelationMatrix, TimeScaleSummary } from "./correlation-matrix";
import { DailyJournal } from "./daily-journal";
import { MetricRegistry } from "./metric-registry";
import { NarrativeRefresh } from "./narrative-refresh";
import { TodaySignals } from "./today-signals";

export function PersonalLabOverviewSection({ data, connectionNotice = null }: { data: PersonalLabOverview; connectionNotice?: "health" | "calendar" | null }) {
  return <>
    {connectionNotice && <div className="lab-notice" role="status">{connectionNotice === "calendar" ? "Google Calendar connected." : "Google Health connected. Import in progress."}</div>}
    <header className="lab-header lab-entry__section lab-entry__header">
      <div className="lab-header__row">
        <h1>Personal Lab</h1>
        <div className="lab-header__signals">
          <TodaySignals key={data.overnightFingerprint ?? "pending"} initial={{ ...data.today, overnightFingerprint: data.overnightFingerprint }} />
        </div>
      </div>
    </header>
  </>;
}

export function PersonalLabJournalSection({ data }: { data: PersonalLabJournal }) {
  return (
    <div className="lab-workspace lab-entry__section lab-entry__journal">
      <div id="daily-journal"><DailyJournal variables={data.journal.variables} entries={data.journal.entries} days={data.journal.days} todayDate={data.todayDate} /></div>
    </div>
  );
}

export function PersonalLabAnalysisSection({ data }: { data: PersonalLabSnapshot }) {
  return <>
    <NarrativeRefresh enabled={data.needsNarrativeRefresh} />
    <div className="lab-entry__section lab-entry__insight"><TimeScaleSummary matrix={data.matrix} narrative={data.aiNarrative} /></div>
    <div className="lab-entry__section lab-entry__relations"><CorrelationMatrix matrix={data.matrix} /></div>
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
  return <section className="lab-stream-placeholder lab-entry__section lab-entry__journal" role="status" aria-live="polite" aria-label="Loading Journal">
    <span className="eyebrow">Journal</span><strong>Preparing recent days</strong>
  </section>;
}

export function PersonalLabAnalysisLoading() {
  return <section className="lab-stream-placeholder lab-stream-placeholder--analysis lab-entry__section lab-entry__insight" role="status" aria-live="polite" aria-label="Loading analysis">
    <span className="eyebrow">Analysis</span><strong>Calculating relationships</strong>
    <span className="system-loading__status" aria-hidden="true"><i /><i /><i /></span>
  </section>;
}
