import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { CorrelationMatrix, TimeScaleSummary } from "./correlation-matrix";
import { DailyJournal } from "./daily-journal";
import { MetricRegistry } from "./metric-registry";
import { NarrativeRefresh } from "./narrative-refresh";
import { TodaySignals } from "./today-signals";

export function PersonalLab({ data, connectionNotice = null }: { data: PersonalLabSnapshot; connectionNotice?: "health" | "calendar" | null }) {
  return <div className="personal-lab-page lab-entry">
    <NarrativeRefresh enabled={data.needsNarrativeRefresh} />
    {connectionNotice && <div className="lab-notice" role="status">{connectionNotice === "calendar" ? "Google Calendar connected." : "Google Health connected. Import in progress."}</div>}
    <header className="lab-header lab-entry__section lab-entry__header">
      <div className="lab-header__row">
        <h1>Personal Lab</h1>
        <div className="lab-header__signals">
          <TodaySignals key={data.overnightFingerprint ?? "pending"} initial={{ ...data.today, overnightFingerprint: data.overnightFingerprint }} />
        </div>
      </div>
    </header>

    <div className="lab-entry__section lab-entry__insight"><TimeScaleSummary matrix={data.matrix} narrative={data.aiNarrative} /></div>

    <div className="lab-workspace lab-entry__section lab-entry__journal">
      <div id="daily-journal"><DailyJournal variables={data.journal.variables} entries={data.journal.entries} days={data.journal.days} todayDate={data.todayDate} /></div>
    </div>

    <div className="lab-entry__section lab-entry__relations"><CorrelationMatrix matrix={data.matrix} /></div>
    <div className="lab-entry__section lab-entry__registry"><MetricRegistry metrics={data.metricRegistry} /></div>
  </div>;
}
