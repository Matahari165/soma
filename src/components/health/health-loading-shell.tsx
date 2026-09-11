type HealthLoadingShellProps = {
  kind: "sleep" | "recovery" | "activity";
  title: string;
  labels: string[];
};

export function HealthLoadingShell({ kind, title, labels }: HealthLoadingShellProps) {
  return (
    <div
      className={`health-detail-page health-detail-page--${kind} health-detail-page--loading`}
      id="main-page-content"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`Chargement des données ${kind === "activity" ? "d’effort" : `de ${title.toLocaleLowerCase("fr-FR")}`}`}
    >
      <header className="health-detail-hero health-detail-hero--with-metrics">
        <div><h1>{title}</h1></div>
        <div className="health-hero-metrics health-loading-metrics" aria-hidden="true">
          {labels.map((label, index) => (
            <div className={index === 0 ? "health-hero-score health-loading-card" : "health-hero-stat health-loading-card"} key={label}>
              <span>{label}</span>
              <span className="health-loading-value" />
              <span className="health-loading-meta" />
            </div>
          ))}
        </div>
      </header>
      <div className="health-loading-content" aria-hidden="true">
        <span className="health-loading-panel" />
        <span className="health-loading-panel health-loading-panel--tall" />
        <span className="health-loading-panel" />
      </div>
      <span className="sr-only">Chargement…</span>
    </div>
  );
}
