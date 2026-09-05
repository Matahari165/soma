import { ScoreRing } from "@/components/dashboard/score-ring";

export default function Loading() {
  return (
    <div className="health-detail-page health-detail-page--recovery health-detail-page--loading" id="main-page-content" role="status" aria-label="Loading recovery data">
      <header className="health-detail-hero health-detail-hero--with-metrics">
        <div>
          <h1>Recovery</h1>
          <span className="system-loading__status" aria-hidden="true"><i /><i /><i /></span>
        </div>
        <div className="health-hero-metrics">
          <div className="health-hero-score">
            <ScoreRing kind="recovery" label="Score" score={null} decorative />
          </div>
          <div className="health-hero-stat">
            <span>HRV</span>
            <strong className="metric-reading"><span>—</span></strong>
          </div>
          <div className="health-hero-stat">
            <span>Resting HR</span>
            <strong className="metric-reading"><span>—</span></strong>
          </div>
        </div>
      </header>
    </div>
  );
}
