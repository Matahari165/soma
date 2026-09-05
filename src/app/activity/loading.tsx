import { ScoreRing } from "@/components/dashboard/score-ring";

export default function Loading() {
  return (
    <div className="health-detail-page health-detail-page--activity health-detail-page--loading" id="main-page-content" role="status" aria-label="Loading activity data">
      <header className="health-detail-hero health-detail-hero--with-metrics">
        <div>
          <h1>Activity</h1>
          <span className="system-loading__status" aria-hidden="true"><i /><i /><i /></span>
        </div>
        <div className="health-hero-metrics">
          <div className="health-hero-score">
            <ScoreRing kind="effort" label="Score" score={null} decorative />
          </div>
          <div className="health-hero-stat">
            <span>Zone minutes</span>
            <strong className="metric-reading"><span>—</span></strong>
          </div>
          <div className="health-hero-stat">
            <span>Steps</span>
            <strong className="metric-reading"><span>—</span></strong>
          </div>
        </div>
      </header>
    </div>
  );
}
