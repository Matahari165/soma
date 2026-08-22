"use client";

import { useMemo, useState } from "react";

import type { LabConfidence } from "@/domain/lab/insights";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { DiscoveryCard } from "./discovery-card";

type Filter = "all" | LabConfidence;

export function DiscoveriesExplorer({ data }: { data: PersonalLabSnapshot }) {
  const [filter, setFilter] = useState<Filter>("all");
  const discoveries = useMemo(() => filter === "all" ? data.discoveries : data.discoveries.filter((item) => item.confidence === filter), [data.discoveries, filter]);
  return <div className="discoveries-page" id="main-page-content">
    <header className="discoveries-hero"><div><span className="eyebrow">Personal evidence library</span><h1>Discoveries</h1><p>{data.testedCount} relationships tested across health, attention, and Deep Work. Only {data.eligibleCount} currently clear the evidence threshold.</p></div><dl><div><dt>Paired days</dt><dd>{data.coverage.pairedDeepWorkDays}</dd></div><div><dt>Check-ins</dt><dd>{data.coverage.checkinDays}</dd></div></dl></header>
    <div className="discovery-filters" role="group" aria-label="Filter discoveries by evidence strength">{(["all", "strong", "promising", "early"] as const).map((value) => <button type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{value === "all" ? `All ${data.discoveries.length}` : value}</button>)}</div>
    {discoveries.length ? <section className="discoveries-grid" aria-label="Personal discoveries">{discoveries.map((discovery) => <DiscoveryCard discovery={discovery} key={discovery.id} />)}</section> : <section className="lab-empty"><h2>No findings in this evidence level yet.</h2><p>More paired days can strengthen early signals.</p></section>}
    <p className="lab-method-note">These are within-person associations. They help you form better questions and small experiments; they do not establish causality.</p>
  </div>;
}
