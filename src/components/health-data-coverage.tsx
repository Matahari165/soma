import type { SyncStatus } from "@/domain/health";
import type { HealthDataCoverage } from "@/domain/health/data-coverage";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${value}T12:00:00Z`));
}

export function HealthDataCoverageIndicator({ coverage, phase, error = false }: {
  coverage?: HealthDataCoverage;
  phase?: SyncStatus["phase"];
  error?: boolean;
}) {
  const updating = Boolean(phase && ["queued", "fetching", "materializing", "retrying"].includes(phase));
  const status = error
    ? { label: "Unavailable", tone: "error" }
    : updating
      ? { label: "Updating", tone: "updating" }
      : coverage?.status === "complete"
        ? { label: "Complete", tone: "complete" }
        : coverage?.status === "incomplete"
          ? { label: "Check", tone: "warning" }
          : coverage?.status === "limited"
            ? { label: "Limit reached", tone: "warning" }
            : coverage?.status === "empty"
              ? { label: "No data", tone: "empty" }
              : { label: "Checking", tone: "updating" };
  const days = coverage ? `${coverage.usedDays} / ${coverage.importedDays}` : "—";
  const nights = coverage ? `${coverage.usedNights} / ${coverage.importedNights}` : "—";
  const period = coverage ? `${formatDate(coverage.startDate)} — ${formatDate(coverage.endDate)}` : "—";

  return <section className="health-data-coverage" aria-labelledby="health-data-coverage-title" aria-busy={!coverage && !error}>
    <header>
      <strong id="health-data-coverage-title">Data in Soma</strong>
      <span className={`health-data-coverage__status health-data-coverage__status--${status.tone}`}>{status.label}</span>
    </header>
    <dl>
      <div><dt>Wearable days used / available</dt><dd>{days}</dd></div>
      <div><dt>Wearable nights used / available</dt><dd>{nights}</dd></div>
      <div className="health-data-coverage__period"><dt>Period</dt><dd>{period}</dd></div>
    </dl>
    {coverage && (coverage.missingDays > 0 || coverage.missingNights > 0) ? <p role="status">
      {coverage.missingDays} day{coverage.missingDays === 1 ? "" : "s"} · {coverage.missingNights} night{coverage.missingNights === 1 ? "" : "s"} not yet used
    </p> : null}
  </section>;
}
