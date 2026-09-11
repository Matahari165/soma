import { HealthLoadingShell } from "@/components/health/health-loading-shell";
import styles from "@/components/health/activity-redesign.module.css";

export default function Loading() {
  return (
    <div className={styles.root}>
      <HealthLoadingShell kind="activity" title="Effort" labels={["Score d’effort", "Minutes en zone", "Pas", "Énergie active"]} />
    </div>
  );
}
