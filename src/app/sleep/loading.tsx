import { HealthLoadingShell } from "@/components/health/health-loading-shell";
import styles from "@/components/health/sleep-redesign.module.css";

export default function Loading() {
  return (
    <div className={styles.root}>
      <HealthLoadingShell kind="sleep" title="Sommeil" labels={["Score de sommeil", "Durée de sommeil", "Régularité", "Dette de sommeil"]} />
    </div>
  );
}
