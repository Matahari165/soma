import { ArrowUpRight, CheckCircle2, FlaskConical } from "lucide-react";

import type { LabDiscovery } from "@/domain/lab/insights";

const confidenceLabels = { early: "Early signal", promising: "Promising", strong: "Strongest evidence" } as const;

export function DiscoveryCard({ discovery, featured = false }: { discovery: LabDiscovery; featured?: boolean }) {
  const Tag = featured ? "section" : "article";
  return <Tag className={featured ? "lab-featured" : "discovery-card"}>
    <div className="discovery-card__meta">
      <span className={`evidence-badge evidence-badge--${discovery.confidence}`}><FlaskConical size={13} />{confidenceLabels[discovery.confidence]}</span>
      {discovery.stable && <span className="stability-label"><CheckCircle2 size={13} />Direction held over time</span>}
    </div>
    <h2>{discovery.title}</h2>
    <p>{discovery.description}</p>
    <footer><span>{discovery.evidence}</span>{!featured && <ArrowUpRight size={16} aria-hidden="true" />}</footer>
  </Tag>;
}
