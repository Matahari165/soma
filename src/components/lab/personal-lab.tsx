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
    { label: "Sommeil", value: duration(data.today.sleepMinutes), href: "/sleep" },
    { label: "Récupération", value: data.today.recoveryScore === null ? "—" : String(Math.round(data.today.recoveryScore)), href: "/recovery" },
    { label: "Deep Work", value: duration(data.today.deepWorkMinutes), href: data.connections.calendar.connected ? "/trends" : "/settings?calendar=setup" },
    { label: "Journal", value: data.journal.entries.length ? String(data.journal.entries.length) : "—", href: "#daily-journal" },
  ];
  return <section className="lab-signals" aria-label="Aujourd’hui">{signals.map(({ label, value, href }) => <Link href={href} key={label}><span>{label}</span><strong>{value}</strong></Link>)}</section>;
}

export function PersonalLab({ data, connectionNotice = null }: { data: PersonalLabSnapshot; connectionNotice?: "health" | "calendar" | null }) {
  const lead = data.matrix.topRelations[0] ?? null;
  return <div className="personal-lab-page">
    <NarrativeRefresh enabled={data.needsNarrativeRefresh} />
    {connectionNotice && <div className="lab-notice" role="status">{connectionNotice === "calendar" ? "Google Calendar connecté." : "Google Health connecté. Import en cours."}</div>}
    <header className="lab-header">
      <div><span className="page-date">{data.dateLabel}</span><h1>Laboratoire personnel</h1></div>
    </header>

    {lead ? <LeadMatrixFinding relation={lead} narrative={data.aiNarrative} /> : <section className="lab-empty"><h2>Pas encore assez de données appariées.</h2></section>}

    <TodaySignals data={data} />

    <div className="lab-workspace">
      <div id="daily-journal"><DailyJournal variables={data.journal.variables} entries={data.journal.entries} entryDate={data.journal.entryDate} /></div>
      <aside className="coverage-card" aria-labelledby="coverage-title">
        <h2 id="coverage-title">Données</h2>
        <dl>
          <div><dt>Jours santé</dt><dd>{data.coverage.healthDays}</dd></div>
          <div><dt>Jours Deep Work</dt><dd>{data.coverage.calendarDays}</dd></div>
          <div><dt>Jours de journal</dt><dd>{data.coverage.journalDays}</dd></div>
        </dl>
        <div className="coverage-sources">
          <span className={data.connections.health.connected ? "is-connected" : ""}>Health {data.connections.health.connected ? "connecté" : "absent"}</span>
          <span className={data.connections.calendar.connected ? "is-connected" : ""}>Calendar {data.connections.calendar.connected ? "connecté" : "absent"}</span>
        </div>
        {(!data.connections.health.connected || !data.connections.calendar.connected) && <Link className="secondary-button" href="/settings?tab=connections">Connexions</Link>}
      </aside>
    </div>

    <CorrelationMatrix matrix={data.matrix} />
  </div>;
}
