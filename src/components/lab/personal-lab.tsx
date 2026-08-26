import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { CorrelationMatrix, TimeScaleSummary } from "./correlation-matrix";
import { DailyJournal } from "./daily-journal";
import { MetricRegistry } from "./metric-registry";
import { NarrativeRefresh } from "./narrative-refresh";
import { PersonalLabMark } from "./personal-lab-mark";
import { TodaySignals } from "./today-signals";

export function PersonalLab({ data, connectionNotice = null }: { data: PersonalLabSnapshot; connectionNotice?: "health" | "calendar" | null }) {
  return <div className="personal-lab-page">
    <NarrativeRefresh enabled={data.needsNarrativeRefresh} />
    {connectionNotice && <div className="lab-notice" role="status">{connectionNotice === "calendar" ? "Google Calendar connected." : "Google Health connected. Import in progress."}</div>}
    <header className="lab-header">
      <div className="lab-header__row">
        <div className="lab-header__title">
          <PersonalLabMark />
          <h1>Personal Lab</h1>
        </div>
        <div className="lab-header__signals">
          <TodaySignals key={data.overnightFingerprint ?? "pending"} initial={{ ...data.today, overnightFingerprint: data.overnightFingerprint }} />
        </div>
      </div>
    </header>

    <TimeScaleSummary matrix={data.matrix} narrative={data.aiNarrative} />

    <div className="lab-workspace">
      <div id="daily-journal"><DailyJournal variables={data.journal.variables} entries={data.journal.entries} days={data.journal.days} todayDate={data.todayDate} /></div>
    </div>

    <CorrelationMatrix matrix={data.matrix} />
    <MetricRegistry metrics={data.metricRegistry} />
  </div>;
}
