import {
  GOOGLE_HEALTH_HOURLY_DATA_TYPES,
  getGrantedGoogleHealthDataTypes,
} from "./client";

export const GOOGLE_HEALTH_AUTOMATIC_SYNC_INTERVAL_MINUTES = 60;
export const GOOGLE_HEALTH_AUTOMATIC_SYNC_LOOKBACK_DAYS = 3;
export const GOOGLE_HEALTH_MANUAL_SYNC_LOOKBACK_DAYS = 90;
export const GOOGLE_HEALTH_ANALYTICS_BACKFILL_VERSION = 1;
export const GOOGLE_HEALTH_ANALYTICS_BACKFILL_IDEMPOTENCY_KEY = `google-health-analytics-backfill-v${GOOGLE_HEALTH_ANALYTICS_BACKFILL_VERSION}`;

type GoogleHealthConnectionMetadata = {
  api_sync_start?: unknown;
  takeout_imported_through?: unknown;
  analytics_backfill_version?: unknown;
};

function metadataObject(value: unknown): GoogleHealthConnectionMetadata {
  return typeof value === "object" && value !== null ? value as GoogleHealthConnectionMetadata : {};
}

function validIsoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ? null : value;
}

export function googleHealthHistorySeededFromTakeout(metadata: unknown) {
  return validIsoDate(metadataObject(metadata).takeout_imported_through) !== null;
}

export function googleHealthAnalyticsBackfillVersion(metadata: unknown) {
  const version = metadataObject(metadata).analytics_backfill_version;
  return typeof version === "number" && Number.isInteger(version) && version >= 0 ? version : 0;
}

export function googleHealthAnalyticsBackfillNeeded(metadata: unknown) {
  return googleHealthAnalyticsBackfillVersion(metadata) < GOOGLE_HEALTH_ANALYTICS_BACKFILL_VERSION;
}

export function shouldQueueGoogleHealthAnalyticsBackfill(input: {
  metadata: unknown;
  analyticsBackfillOpen: boolean;
}) {
  if (!googleHealthAnalyticsBackfillNeeded(input.metadata)) return false;
  return !input.analyticsBackfillOpen;
}

export function clampGoogleHealthRangeToConnection<T extends { start: string; end: string }>(range: T, metadata: unknown): T {
  const configured = validIsoDate(metadataObject(metadata).api_sync_start);
  if (!configured) return range;
  const floor = `${configured}T00:00:00.000Z`;
  return { ...range, start: range.start < floor ? floor : range.start };
}

type AutomaticSyncInput = {
  now: Date;
  timezone: string;
  lastLabSyncedAt: string | null;
};

type ZonedClock = {
  civilDate: string;
  hour: number;
};

export function zonedClock(date: Date, timezone: string): ZonedClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = Number(value("hour"));
  if (!year || !month || !day || !Number.isInteger(hour)) throw new Error(`Invalid profile timezone: ${timezone}`);
  return { civilDate: `${year}-${month}-${day}`, hour };
}

export function isAutomaticGoogleHealthSyncDue({ now, timezone, lastLabSyncedAt }: AutomaticSyncInput) {
  const current = zonedClock(now, timezone);
  const slot = new Date(now);
  slot.setUTCMinutes(0, 0, 0);
  if (!lastLabSyncedAt) return { due: true, civilDate: current.civilDate, slot: slot.toISOString() };
  return { due: new Date(lastLabSyncedAt) < slot, civilDate: current.civilDate, slot: slot.toISOString() };
}

export function automaticGoogleHealthRange(now: Date) {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - GOOGLE_HEALTH_AUTOMATIC_SYNC_LOOKBACK_DAYS);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function manualGoogleHealthRange(now: Date) {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - GOOGLE_HEALTH_MANUAL_SYNC_LOOKBACK_DAYS);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function automaticGoogleHealthDataTypes(scopes: readonly string[]) {
  const hourly = new Set(GOOGLE_HEALTH_HOURLY_DATA_TYPES);
  return getGrantedGoogleHealthDataTypes(scopes).filter((dataType) => hourly.has(dataType));
}
