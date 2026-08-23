import Link from "next/link";

import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { CorrelationMatrix, LeadMatrixFinding } from "./correlation-matrix";
import { DailyJournal } from "./daily-journal";
import { NarrativeRefresh } from "./narrative-refresh";

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60).toString().padStart(2, "0")}`;
}

function TodaySignals({ data }: { data: PersonalLabSnapshot }) {
  const signals = [
    { label: "Sleep", value: duration(data.today.sleepMinutes), href: "/sleep" },
    { label: "Recovery", value: data.today.recoveryScore === null ? "—" : String(Math.round(data.today.recoveryScore)), href: "/recovery" },
    { label: "Deep Work", value: duration(data.today.deepWorkMinutes), href: data.connections.calendar.connected ? "#relations" : "/settings?calendar=setup" },
    { label: "Journal", value: data.journal.entries.length ? String(data.journal.entries.length) : "—", href: "#daily-journal" },
  ];
  return <section className="lab-signals" aria-label="Today">{signals.map(({ label, value, href }) => <Link href={href} key={label}><span>{label}</span><strong>{value}</strong></Link>)}</section>;
}

export function PersonalLab({ data, connectionNotice = null }: { data: PersonalLabSnapshot; connectionNotice?: "health" | "calendar" | null }) {
  const lead = data.matrix.topRelations[0] ?? null;
  return <div className="personal-lab-page">
    <NarrativeRefresh enabled={data.needsNarrativeRefresh} />
    {connectionNotice && <div className="lab-notice" role="status">{connectionNotice === "calendar" ? "Google Calendar connected." : "Google Health connected. Import in progress."}</div>}
    <header className="lab-header">
      <div><span className="page-date">{data.dateLabel}</span><h1>Personal Lab</h1></div>
    </header>

    {lead ? <LeadMatrixFinding relation={lead} narrative={data.aiNarrative} /> : <section className="lab-empty"><h2>Not enough paired data yet.</h2></section>}

    <TodaySignals data={data} />

    <div className="lab-workspace">
      <div id="daily-journal"><DailyJournal variables={data.journal.variables} entries={data.journal.entries} entryDate={data.journal.entryDate} /></div>
      <aside className="coverage-card" aria-labelledby="coverage-title">
        <h2 id="coverage-title">Data</h2>
        <dl>
          <div><dt>Health days</dt><dd>{data.coverage.healthDays}</dd></div>
          <div><dt>Deep Work days</dt><dd>{data.coverage.calendarDays}</dd></div>
          <div><dt>Journal days</dt><dd>{data.coverage.journalDays}</dd></div>
        </dl>
        <div className="coverage-sources">
          <span className={data.connections.health.connected ? "is-connected" : ""}>Health {data.connections.health.connected ? "connected" : "not connected"}</span>
          <span className={data.connections.calendar.connected ? "is-connected" : ""}>Calendar {data.connections.calendar.connected ? "connected" : "not connected"}</span>
        </div>
        {(!data.connections.health.connected || !data.connections.calendar.connected) && <Link className="secondary-button" href="/settings?tab=connections">Connections</Link>}
      </aside>
    </div>

    <CorrelationMatrix matrix={data.matrix} />
  </div>;
}
