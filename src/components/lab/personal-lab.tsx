import type { PersonalLabJournal, PersonalLabOverview, PersonalLabSnapshot } from "@/services/personal-lab";

import { MatrixDisclosure, TimeScaleSummary } from "./correlation-matrix";
import { MetricRegistry } from "./metric-registry";
import { PersonalLabJournalWorkspace } from "./personal-lab-journal-workspace";
import { NarrativeRefresh } from "./narrative-refresh";
import { PersonalLabMetrics } from "./today-signals";

export function PersonalLabOverviewSection({ data, connectionNotice = null }: { data: PersonalLabOverview; connectionNotice?: "health" | "calendar" | null }) {
  return <>
    {connectionNotice && <div className="lab-notice" role="status">{connectionNotice === "calendar" ? "Google Calendar connecté." : "Google Health connecté. Import en cours."}</div>}
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

export function PersonalLabJournalSection({ data }: { data: PersonalLabJournal }) {
  return (
    <div className="lab-workspace lab-entry__section lab-entry__journal">
      <PersonalLabJournalWorkspace data={data} />
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
  return <header className="lab-header lab-entry__section lab-entry__header lab-stream-loading" role="status" aria-live="polite" aria-label="Chargement des signaux du jour">
    <div className="lab-header__row">
      <h1>Personal Lab</h1>
      <span className="lab-loading-trace" aria-hidden="true" />
    </div>
    <span className="sr-only">Chargement des signaux du jour…</span>
  </header>;
}

export function PersonalLabJournalLoading() {
  return <section className="lab-stream-placeholder lab-entry__section lab-entry__journal" role="status" aria-live="polite" aria-label="Chargement du journal du jour">
    <strong>Préparation du journal…</strong>
  </section>;
}

export function PersonalLabAnalysisLoading() {
  return <section className="lab-stream-placeholder lab-stream-placeholder--analysis lab-entry__section lab-entry__insight" role="status" aria-live="polite" aria-label="Chargement de l’analyse">
    <strong>Préparation de l’analyse…</strong>
    <span className="lab-loading-trace" aria-hidden="true" />
  </section>;
}
