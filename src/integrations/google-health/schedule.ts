import {
  GOOGLE_HEALTH_HOURLY_DATA_TYPES,
  getGrantedGoogleHealthDataTypes,
} from "./client";

export const GOOGLE_HEALTH_AUTOMATIC_SYNC_INTERVAL_MINUTES = 60;
export const GOOGLE_HEALTH_AUTOMATIC_SYNC_LOOKBACK_DAYS = 3;

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

export function automaticGoogleHealthDataTypes(scopes: readonly string[]) {
  const hourly = new Set(GOOGLE_HEALTH_HOURLY_DATA_TYPES);
  return getGrantedGoogleHealthDataTypes(scopes).filter((dataType) => hourly.has(dataType));
}
