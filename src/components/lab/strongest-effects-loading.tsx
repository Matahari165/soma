import type { ReactNode } from "react";

import styles from "./strongest-effects-loading.module.css";

/** A quiet placeholder shared by route navigation and the data request. */
export function StrongestEffectsLoading({
  showSummary = true,
  statusMessage = "Chargement des relations…",
}: {
  showSummary?: boolean;
  filterControl?: ReactNode;
  periodControl?: ReactNode;
  statusMessage?: string;
}) {
  return <section className={`strongest-effects-panel lab-entry__section ${styles.scene}`} data-with-summary={showSummary} aria-busy="true">
    <p className={styles.status} role="status" aria-live="polite">{statusMessage}</p>
    <div className={styles.traces} aria-hidden="true"><span /><span /><span /></div>
  </section>;
}
