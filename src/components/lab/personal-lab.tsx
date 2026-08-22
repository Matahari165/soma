import { ArrowRight, CalendarDays, Check, HeartPulse, Link2, MoonStar, Sparkles, TimerReset } from "lucide-react";
import Link from "next/link";

import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { DailyCheckinForm } from "./daily-checkin";
import { DiscoveryCard } from "./discovery-card";

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60).toString().padStart(2, "0")}`;
}

function TodaySignals({ data }: { data: PersonalLabSnapshot }) {
  const signals = [
    { label: "Sleep", value: duration(data.today.sleepMinutes), detail: "last night", icon: MoonStar, href: "/sleep" },
    { label: "Recovery", value: data.today.recoveryScore === null ? "—" : String(Math.round(data.today.recoveryScore)), detail: "personal score", icon: HeartPulse, href: "/recovery" },
    { label: "Deep Work", value: duration(data.today.deepWorkMinutes), detail: data.today.deepWorkSource === "corrected" ? "corrected" : data.today.deepWorkSource === "calendar" ? "from Calendar" : "not connected", icon: TimerReset, href: data.connections.calendar.connected ? "/trends" : "/settings?calendar=setup" },
    { label: "Daily context", value: data.checkin ? `${data.today.focus ?? "—"}/5` : "—", detail: data.checkin ? "focus recorded" : "check-in pending", icon: Sparkles, href: "#daily-checkin" },
  ];
  return <section className="lab-signals" aria-label="Today in context">{signals.map(({ label, value, detail, icon: Icon, href }) => <Link href={href} key={label}><span><Icon size={17} />{label}</span><strong>{value}</strong><small>{detail}</small></Link>)}</section>;
}

export function PersonalLab({ data, connectionNotice = null }: { data: PersonalLabSnapshot; connectionNotice?: "health" | "calendar" | null }) {
  return <div className="personal-lab-page">
    {connectionNotice && <div className="lab-notice" role="status"><Check size={16} /><span>{connectionNotice === "calendar" ? "Google Calendar connected. Your Deep Work history is ready." : "Google Health connected. Soma is importing your history."}</span></div>}
    <header className="lab-header">
      <div><span className="page-date">{data.dateLabel}</span><h1>Personal Lab</h1></div>
      <p>Find the conditions behind your best days — across health, attention, and real work.</p>
    </header>

    <section className="lab-question" aria-labelledby="lab-question-title">
      <div><span className="eyebrow">Leading finding</span><h2 id="lab-question-title">What changes your best days?</h2></div>
      <dl><div><dt>Relationships tested</dt><dd>{data.testedCount}</dd></div><div><dt>Worth showing</dt><dd>{data.eligibleCount}</dd></div></dl>
    </section>
    {data.featured ? <DiscoveryCard discovery={data.featured} featured /> : <section className="lab-empty"><h2>Your first personal finding is still forming.</h2><p>Fourteen paired days unlock early signals. Add daily context and connect Calendar to make the comparisons useful.</p></section>}

    <TodaySignals data={data} />

    <div className="lab-workspace">
      <div id="daily-checkin"><DailyCheckinForm checkin={data.checkin} date={data.todayDate} calendarDeepWorkMinutes={data.today.calendarDeepWorkMinutes} /></div>
      <aside className="coverage-card" aria-labelledby="coverage-title">
        <span className="eyebrow">Evidence coverage</span><h2 id="coverage-title">What Soma can compare</h2>
        <dl>
          <div><dt>Health days</dt><dd>{data.coverage.healthDays}</dd></div>
          <div><dt>Deep Work days</dt><dd>{data.coverage.calendarDays}</dd></div>
          <div><dt>Check-ins</dt><dd>{data.coverage.checkinDays}</dd></div>
          <div><dt>Sleep ↔ work pairs</dt><dd>{data.coverage.pairedDeepWorkDays}</dd></div>
        </dl>
        <div className="coverage-sources">
          <span className={data.connections.health.connected ? "is-connected" : ""}><HeartPulse size={15} />Health {data.connections.health.connected ? "connected" : "missing"}</span>
          <span className={data.connections.calendar.connected ? "is-connected" : ""}><CalendarDays size={15} />Calendar {data.connections.calendar.connected ? "connected" : "missing"}</span>
        </div>
        {(!data.connections.health.connected || !data.connections.calendar.connected) && <Link className="secondary-button" href="/settings?tab=connections"><Link2 size={15} />Complete sources</Link>}
      </aside>
    </div>

    <section className="lab-discoveries" aria-labelledby="discoveries-title">
      <header><div><span className="eyebrow">Your evidence</span><h2 id="discoveries-title">What your data is teaching you</h2></div><Link href="/trends">Explore all <ArrowRight size={16} /></Link></header>
      {data.discoveries.length ? <div>{data.discoveries.slice(1, 7).map((discovery) => <DiscoveryCard discovery={discovery} key={discovery.id} />)}</div> : <p className="lab-discoveries__empty">Keep checking in. Soma will surface only comparisons with enough paired days.</p>}
    </section>
    <p className="lab-method-note">Soma compares your own days, checks whether a direction repeats over time, and always treats a relationship as a clue — never a diagnosis or proof of cause.</p>
  </div>;
}
