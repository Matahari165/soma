import type { ReactNode } from "react";

import styles from "./strongest-effects-loading.module.css";

/** Shared stable layout for the route fallback and the panel's data request. */
export function StrongestEffectsLoading({
  showSummary = true,
  filterControl,
  periodControl,
  statusMessage = "Chargement des relations…",
}: {
  showSummary?: boolean;
  filterControl?: ReactNode;
  periodControl?: ReactNode;
  statusMessage?: string;
}) {
  return <div className="strongest-effects-panel lab-entry__section" aria-busy="true">
    {showSummary && <section className={`effects-summary ${styles.summary}`} aria-hidden="true">
      <ol className={styles.summaryRows}>
        <li className={styles.summaryRow}><span className={styles.arrow} /><span className={`${styles.placeholder} ${styles.summaryLong}`} /></li>
        <li className={styles.summaryRow}><span className={styles.arrow} /><span className={`${styles.placeholder} ${styles.summaryMedium}`} /></li>
        <li className={styles.summaryRow}><span className={styles.arrow} /><span className={`${styles.placeholder} ${styles.summaryShort}`} /></li>
      </ol>
      <div className={styles.summaryAction}>
        <span className={styles.actionButton} />
        <span className={`${styles.placeholder} ${styles.actionDescription}`} />
      </div>
    </section>}

    <section className={`strongest-effects ${styles.effects}`} aria-labelledby="strongest-effects-loading-title">
      <header>
        <div><h2 id="strongest-effects-loading-title">Strongest Effects</h2></div>
        <div className="strongest-effects__controls">
          {filterControl ?? <span className={styles.stabilityControl} aria-hidden="true"><span className={styles.checkbox} /><span className={`${styles.placeholder} ${styles.stabilityLabel}`} /></span>}
          {periodControl ?? <span className={styles.periods} aria-hidden="true"><span /><span /><span className={styles.periodSelected} /><span /></span>}
        </div>
      </header>

      <div className={styles.group} aria-hidden="true">
        <span className={`${styles.placeholder} ${styles.groupLabel}`} />
        <div className={styles.influence}>
          <span className={`${styles.placeholder} ${styles.influenceLabel}`} />
          {[0, 1, 2].map((row) => <div className={styles.comparison} key={row}>
            <span className={`${styles.placeholder} ${styles.comparisonLabel}`} />
            <div className={styles.resultRow}>
              <span className={styles.plot}><span className={styles.zero} /><span className={styles.interval} /><span className={styles.point} /></span>
              <span className={styles.resultText}><span className={`${styles.placeholder} ${styles.outcomeLabel}`} /><span className={`${styles.placeholder} ${styles.outcomeValue}`} /></span>
            </div>
          </div>)}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>
    </section>
  </div>;
}
