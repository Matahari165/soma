import type { SyncStatus } from "@/domain/health";
import type { HealthDataCoverage } from "@/domain/health/data-coverage";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${value}T12:00:00Z`));
}

export function HealthDataCoverageIndicator({ coverage, phase, error = false }: {
  coverage?: HealthDataCoverage;
  phase?: SyncStatus["phase"];
  error?: boolean;
}) {
  const updating = Boolean(phase && ["queued", "fetching", "materializing", "retrying"].includes(phase));
  const status = error
    ? { label: "Indisponible", tone: "error" }
    : updating
      ? { label: "Mise à jour", tone: "updating" }
      : coverage?.status === "complete"
        ? { label: "Complète", tone: "complete" }
        : coverage?.status === "incomplete"
          ? { label: "À vérifier", tone: "warning" }
          : coverage?.status === "limited"
            ? { label: "Limite atteinte", tone: "warning" }
            : coverage?.status === "empty"
              ? { label: "Aucune donnée", tone: "empty" }
              : { label: "Vérification", tone: "updating" };
  const days = coverage ? `${coverage.usedDays} / ${coverage.importedDays}` : "—";
  const nights = coverage ? `${coverage.usedNights} / ${coverage.importedNights}` : "—";
  const period = coverage ? `${formatDate(coverage.startDate)} — ${formatDate(coverage.endDate)}` : "—";

  return <section className="health-data-coverage" data-scroll-reveal="coverage" aria-labelledby="health-data-coverage-title" aria-busy={!coverage && !error}>
    <header>
      <strong id="health-data-coverage-title">Données dans Soma</strong>
      <span className={`health-data-coverage__status health-data-coverage__status--${status.tone}`}>{status.label}</span>
    </header>
    <dl>
      <div><dt>Jours importés / utilisés</dt><dd>{days}</dd></div>
      <div><dt>Nuits importées / utilisées</dt><dd>{nights}</dd></div>
      <div className="health-data-coverage__period"><dt>Période</dt><dd>{period}</dd></div>
    </dl>
    <p className="health-data-coverage__source">Source : Google Health · données importées distinguées des calculs Soma.</p>
    {coverage && (coverage.missingDays > 0 || coverage.missingNights > 0) ? <p role="status">
      {coverage.missingDays} jour{coverage.missingDays === 1 ? "" : "s"} non encore utilisé{coverage.missingDays === 1 ? "" : "s"} · {coverage.missingNights} nuit{coverage.missingNights === 1 ? "" : "s"} non encore utilisée{coverage.missingNights === 1 ? "" : "s"}
    </p> : null}
  </section>;
}
