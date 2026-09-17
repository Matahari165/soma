import observatoryStyles from "./health-observatory.module.css";
import styles from "./health-loading-shell.module.css";

type HealthLoadingShellProps = {
  kind: "sleep" | "recovery" | "activity";
  title: string;
};

const signalSlots = ["first", "second", "third", "fourth"];
const trendSlots = ["first", "second"];

export function HealthLoadingShell({ kind, title }: HealthLoadingShellProps) {
  return (
    <div
      className={`${observatoryStyles.observatory} ${styles.shell} health-observatory-route`}
      id="main-page-content"
      data-health-kind={kind}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`Loading ${title}`}
    >
      <header className={styles.header}>
        <h1>{title}</h1>
        <p className={styles.status}>Loading data…</p>
      </header>

      <section className={styles.overview} aria-hidden="true">
        <div className={styles.overviewVisual} />
        <div className={styles.overviewSummary}>
          <span className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
          <span className={`${styles.skeletonLine} ${styles.skeletonLineValue}`} />
          <span className={`${styles.skeletonLine} ${styles.skeletonLineMeta}`} />
          <span className={`${styles.skeletonLine} ${styles.skeletonLineRule}`} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="health-loading-recent-heading">
        <header className={styles.sectionHeader}>
          <h2 id="health-loading-recent-heading">Recent indicators</h2>
          <span className={styles.sectionMeta} aria-hidden="true" />
        </header>
        <div className={styles.signalGrid} aria-hidden="true">
          {signalSlots.map((slot) => <span className={styles.signal} data-testid="health-loading-signal-slot" key={slot} />)}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="health-loading-trends-heading">
        <header className={styles.sectionHeader}>
          <h2 id="health-loading-trends-heading">Trends</h2>
          <span className={styles.sectionMeta}>30 days</span>
        </header>
        <div className={styles.trendGrid} aria-hidden="true">
          {trendSlots.map((slot) => (
            <div className={styles.trend} data-testid="health-loading-trend-slot" key={slot}>
              <span className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
              <div className={styles.trendLines}>
                <span />
                <span className={styles.trendLineShort} />
                <span />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="health-loading-evidence-heading">
        <header className={styles.sectionHeader}>
          <h2 id="health-loading-evidence-heading">Supporting data</h2>
        </header>
        <div className={styles.evidence} aria-hidden="true">
          <span className={`${styles.skeletonLine} ${styles.skeletonLineMedium}`} />
          <span className={`${styles.skeletonLine} ${styles.skeletonLineLong}`} />
        </div>
      </section>

      <section className={`${styles.section} ${styles.provenance}`} aria-labelledby="health-loading-quality-heading">
        <h2 id="health-loading-quality-heading">Data quality</h2>
        <span className={styles.provenanceLine} aria-hidden="true" />
      </section>
    </div>
  );
}
