import { GOOGLE_HEALTH_DASHBOARD_DATA_TYPES, getGrantedGoogleHealthDataTypes } from "./client";

export const GOOGLE_HEALTH_AUTOMATIC_SYNC_HOUR = 11;
export const GOOGLE_HEALTH_AUTOMATIC_SYNC_LOOKBACK_DAYS = 7;

type AutomaticSyncInput = {
  now: Date;
  timezone: string;
  lastSyncedAt: string | null;
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

export function isAutomaticGoogleHealthSyncDue({ now, timezone, lastSyncedAt }: AutomaticSyncInput) {
  const current = zonedClock(now, timezone);
  if (current.hour !== GOOGLE_HEALTH_AUTOMATIC_SYNC_HOUR) return { due: false, civilDate: current.civilDate };
  if (!lastSyncedAt) return { due: true, civilDate: current.civilDate };
  const lastSync = zonedClock(new Date(lastSyncedAt), timezone);
  return { due: lastSync.civilDate !== current.civilDate, civilDate: current.civilDate };
}

export function automaticGoogleHealthRange(now: Date) {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - GOOGLE_HEALTH_AUTOMATIC_SYNC_LOOKBACK_DAYS);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function automaticGoogleHealthDataTypes(scopes: readonly string[]) {
  const granted = new Set(getGrantedGoogleHealthDataTypes(scopes));
  return GOOGLE_HEALTH_DASHBOARD_DATA_TYPES.filter((dataType) => granted.has(dataType));
}
