import { ScoreRing } from "@/components/dashboard/score-ring";

export default function Loading() {
  return (
    <div className="health-detail-page health-detail-page--sleep health-detail-page--loading" id="main-page-content" role="status" aria-label="Loading sleep data">
      <header className="health-detail-hero health-detail-hero--with-metrics">
        <div>
          <h1>Sleep</h1>
          <span className="system-loading__status" aria-hidden="true"><i /><i /><i /></span>
        </div>
        <div className="health-hero-metrics">
          <div className="health-hero-score">
            <ScoreRing kind="sleep" label="Score" score={null} decorative />
          </div>
          <div className="health-hero-stat health-hero-stat--regularity">
            <ScoreRing kind="sleep" label="Regularity" score={null} decorative />
          </div>
          <div className="health-hero-stat health-hero-stat--debt">
            <span>Sleep debt</span>
            <strong className="metric-reading"><span>—</span></strong>
          </div>
        </div>
      </header>
    </div>
  );
}
