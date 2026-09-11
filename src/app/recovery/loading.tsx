import { HealthLoadingShell } from "@/components/health/health-loading-shell";
import styles from "@/components/health/recovery-redesign.module.css";

export default function Loading() {
  return (
    <div className={styles.page}>
      <HealthLoadingShell kind="recovery" title="Récupération" labels={["Score de récupération", "Durée de sommeil", "Charge du jour", "Énergie métabolique"]} />
    </div>
  );
}
