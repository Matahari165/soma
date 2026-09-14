export const SOMA_LOCALE = "fr-FR";

function parseDate(value: string): Date | null {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(SOMA_LOCALE, options).format(value);
}

export function formatDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string {
  if (!value) return "—";
  const parsed = parseDate(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat(SOMA_LOCALE, options)
    .format(parsed)
    .replace(/\.$/, "");
}

export function formatDateTime(value: string | null | undefined): string {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

export function isoDateInTimeZone(
  date: Date = new Date(),
  timeZone = "Europe/Paris",
): string {
  const parts = new Intl.DateTimeFormat(SOMA_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatDurationMinutes(
  value: number | null | undefined,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const totalMinutes = Math.max(0, Math.round(value));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${formatNumber(hours)} h ${formatNumber(minutes)} min`;
}

export function formatCount(
  value: number | null | undefined,
  singular: string,
  plural = `${singular}s`,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const count = Math.round(value);
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
