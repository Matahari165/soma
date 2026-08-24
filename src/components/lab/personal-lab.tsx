import Link from "next/link";

import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { CorrelationMatrix, TimeScaleSummary } from "./correlation-matrix";
import { DailyJournal } from "./daily-journal";
import { MetricRegistry } from "./metric-registry";
import { NarrativeRefresh } from "./narrative-refresh";

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60).toString().padStart(2, "0")}`;
}

function TodaySignals({ data }: { data: PersonalLabSnapshot }) {
  const signals = [
    { label: "Sleep duration", value: duration(data.today.sleepMinutes), href: "/sleep" },
    { label: "Recovery", value: data.today.recoveryScore === null ? "—" : String(Math.round(data.today.recoveryScore)), href: "/recovery" },
    { label: "Effort", value: data.today.effortScore === null ? "—" : String(Math.round(data.today.effortScore)), href: "/effort" },
  ];
  return <section className="lab-signals" aria-label="Today">{signals.map(({ label, value, href }) => <Link href={href} key={label}><span>{label}</span><strong>{value}</strong></Link>)}</section>;
}

export function PersonalLab({ data, connectionNotice = null }: { data: PersonalLabSnapshot; connectionNotice?: "health" | "calendar" | null }) {
  return <div className="personal-lab-page">
    <NarrativeRefresh enabled={data.needsNarrativeRefresh} />
    {connectionNotice && <div className="lab-notice" role="status">{connectionNotice === "calendar" ? "Google Calendar connected." : "Google Health connected. Import in progress."}</div>}
    <header className="lab-header">
      <div><span className="page-date">{data.dateLabel}</span><h1>Personal Lab</h1></div>
    </header>

    <TimeScaleSummary matrix={data.matrix} narrative={data.aiNarrative} />

    <div className="lab-overview lab-overview--signals"><TodaySignals data={data} /></div>

    <div className="lab-workspace">
      <div id="daily-journal"><DailyJournal variables={data.journal.variables} entries={data.journal.entries} days={data.journal.days} todayDate={data.todayDate} /></div>
    </div>

    <CorrelationMatrix matrix={data.matrix} />
    <MetricRegistry metrics={data.metricRegistry} />
  </div>;
}
