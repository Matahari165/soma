import { getSiteUrl, requireServerEnv } from "@/lib/env";

const API_BASE = "https://health.googleapis.com/v4";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_CLIENT_ID_PATTERN = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;

export const GOOGLE_HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
] as const;

export const GOOGLE_HEALTH_DATA_TYPES = [
  "sleep",
  "daily-heart-rate-variability",
  "daily-resting-heart-rate",
  "daily-heart-rate-zones",
  "daily-respiratory-rate",
  "daily-oxygen-saturation",
  "daily-sleep-temperature-derivations",
  "heart-rate",
  "heart-rate-variability",
  "steps",
  "active-zone-minutes",
  "active-energy-burned",
  "time-in-heart-rate-zone",
  "exercise",
  "active-minutes",
  "activity-level",
  "altitude",
  "blood-glucose",
  "body-fat",
  "calories-in-heart-rate-zone",
  "core-body-temperature",
  "daily-vo2-max",
  "distance",
  "floors",
  "height",
  "oxygen-saturation",
  "respiratory-rate-sleep-summary",
  "run-vo2-max",
  "sedentary-period",
  "swim-lengths-data",
  "total-calories",
  "vo2-max",
  "weight",
] as const;

export type GoogleHealthDataType = (typeof GOOGLE_HEALTH_DATA_TYPES)[number];

export function isGoogleHealthDataType(value: string): value is GoogleHealthDataType {
  return (GOOGLE_HEALTH_DATA_TYPES as readonly string[]).includes(value);
}

const ACTIVITY_DATA_TYPES = new Set<GoogleHealthDataType>([
  "steps", "active-zone-minutes", "active-energy-burned", "time-in-heart-rate-zone", "exercise",
  "active-minutes", "activity-level", "altitude", "calories-in-heart-rate-zone", "distance", "floors",
  "run-vo2-max", "sedentary-period", "swim-lengths-data", "total-calories",
]);

export function scopeForGoogleHealthDataType(dataType: GoogleHealthDataType) {
  if (dataType === "sleep") return GOOGLE_HEALTH_SCOPES[2];
  if (ACTIVITY_DATA_TYPES.has(dataType)) return GOOGLE_HEALTH_SCOPES[0];
  return GOOGLE_HEALTH_SCOPES[1];
}

export function getGrantedGoogleHealthDataTypes(scopes: readonly string[]) {
  const granted = new Set(scopes);
  return GOOGLE_HEALTH_DATA_TYPES.filter((dataType) => granted.has(scopeForGoogleHealthDataType(dataType)));
}

export const GOOGLE_HEALTH_DASHBOARD_DATA_TYPES = [
  "sleep",
  "daily-heart-rate-variability",
  "daily-resting-heart-rate",
  "steps",
  "active-zone-minutes",
] as const satisfies readonly GoogleHealthDataType[];

// High-volume raw streams arrive through Google Health webhooks and the initial
// history import. Keeping them out of the hourly reconciliation prevents a raw
// heart-rate backlog from delaying sleep, recovery, and effort metrics.
const GOOGLE_HEALTH_WEBHOOK_STREAM_TYPES = new Set<GoogleHealthDataType>([
  "heart-rate",
  "heart-rate-variability",
  "activity-level",
]);

export const GOOGLE_HEALTH_HOURLY_DATA_TYPES = GOOGLE_HEALTH_DATA_TYPES.filter(
  (dataType) => !GOOGLE_HEALTH_WEBHOOK_STREAM_TYPES.has(dataType),
);

export const GOOGLE_HEALTH_DAILY_ROLLUP_TYPES = [
  "steps",
  "active-zone-minutes",
  "active-energy-burned",
  "time-in-heart-rate-zone",
  "active-minutes",
  "altitude",
  "calories-in-heart-rate-zone",
  "distance",
  "floors",
  "sedentary-period",
  "total-calories",
] as const satisfies readonly GoogleHealthDataType[];

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: "Bearer";
};

type IdentityResponse = {
  name: string;
  legacyUserId?: string;
  healthUserId: string;
};

export class GoogleHealthRequestError extends Error {
  constructor(public readonly status: number, detail: string) {
    super(`Google Health request failed (${status}): ${detail.slice(0, 1000)}`);
    this.name = "GoogleHealthRequestError";
  }
}

export type DataPointListResponse = {
  dataPoints?: Record<string, unknown>[];
  nextPageToken?: string;
};

export type DailyRollupResponse = {
  rollupDataPoints?: Record<string, unknown>[];
  nextPageToken?: string;
};

export function getGoogleHealthClientId() {
  const clientId = requireServerEnv("GOOGLE_HEALTH_CLIENT_ID").trim();
  if (!GOOGLE_OAUTH_CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error("GOOGLE_HEALTH_CLIENT_ID is not a valid Google OAuth client ID.");
  }
  return clientId;
}

export function getGoogleHealthRedirectUri(siteUrlValue = getSiteUrl()) {
  const siteUrl = new URL(siteUrlValue);
  if (siteUrl.protocol !== "https:" && siteUrl.hostname !== "localhost") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside localhost.");
  }
  return new URL("/api/health/google/callback", siteUrl.origin).toString();
}

export function buildGoogleHealthAuthorizationUrl(state: string, challenge: string, siteUrl = getSiteUrl()) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", getGoogleHealthClientId());
  url.searchParams.set("redirect_uri", getGoogleHealthRedirectUri(siteUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", GOOGLE_HEALTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GoogleHealthRequestError(response.status, "OAuth token exchange failed.");
  }

  return (await response.json()) as TokenResponse;
}

export function exchangeGoogleHealthCode(code: string, verifier: string, siteUrl = getSiteUrl()) {
  return tokenRequest(new URLSearchParams({
    client_id: getGoogleHealthClientId(),
    client_secret: requireServerEnv("GOOGLE_HEALTH_CLIENT_SECRET"),
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: getGoogleHealthRedirectUri(siteUrl),
  }));
}

export function refreshGoogleHealthToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({
    client_id: getGoogleHealthClientId(),
    client_secret: requireServerEnv("GOOGLE_HEALTH_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }));
}

async function googleHealthRequest<T>(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new GoogleHealthRequestError(response.status, detail);
  }

  return (await response.json()) as T;
}

export function getGoogleHealthIdentity(accessToken: string) {
  return googleHealthRequest<IdentityResponse>("/users/me/identity", accessToken);
}

const filterMetadata: Record<GoogleHealthDataType, { field: string; type: "physical" | "date" }> = {
  sleep: { field: "sleep.interval.civil_end_time", type: "date" },
  "daily-heart-rate-variability": { field: "daily_heart_rate_variability.date", type: "date" },
  "daily-resting-heart-rate": { field: "daily_resting_heart_rate.date", type: "date" },
  "daily-heart-rate-zones": { field: "daily_heart_rate_zones.date", type: "date" },
  "daily-respiratory-rate": { field: "daily_respiratory_rate.date", type: "date" },
  "daily-oxygen-saturation": { field: "daily_oxygen_saturation.date", type: "date" },
  "daily-sleep-temperature-derivations": { field: "daily_sleep_temperature_derivations.date", type: "date" },
  "heart-rate": { field: "heart_rate.sample_time.physical_time", type: "physical" },
  "heart-rate-variability": { field: "heart_rate_variability.sample_time.physical_time", type: "physical" },
  steps: { field: "steps.interval.start_time", type: "physical" },
  "active-zone-minutes": { field: "active_zone_minutes.interval.start_time", type: "physical" },
  "active-energy-burned": { field: "active_energy_burned.interval.start_time", type: "physical" },
  "time-in-heart-rate-zone": { field: "time_in_heart_rate_zone.interval.start_time", type: "physical" },
  exercise: { field: "exercise.interval.civil_start_time", type: "date" },
  "active-minutes": { field: "active_minutes.interval.start_time", type: "physical" },
  "activity-level": { field: "activity_level.interval.start_time", type: "physical" },
  altitude: { field: "altitude.interval.start_time", type: "physical" },
  "blood-glucose": { field: "blood_glucose.sample_time.physical_time", type: "physical" },
  "body-fat": { field: "body_fat.sample_time.physical_time", type: "physical" },
  "calories-in-heart-rate-zone": { field: "calories_in_heart_rate_zone.interval.start_time", type: "physical" },
  "core-body-temperature": { field: "core_body_temperature.sample_time.physical_time", type: "physical" },
  "daily-vo2-max": { field: "daily_vo2_max.date", type: "date" },
  distance: { field: "distance.interval.start_time", type: "physical" },
  floors: { field: "floors.interval.start_time", type: "physical" },
  height: { field: "height.sample_time.physical_time", type: "physical" },
  "oxygen-saturation": { field: "oxygen_saturation.sample_time.physical_time", type: "physical" },
  "respiratory-rate-sleep-summary": { field: "respiratory_rate_sleep_summary.sample_time.physical_time", type: "physical" },
  "run-vo2-max": { field: "run_vo2_max.sample_time.physical_time", type: "physical" },
  "sedentary-period": { field: "sedentary_period.interval.start_time", type: "physical" },
  "swim-lengths-data": { field: "swim_lengths_data.interval.start_time", type: "physical" },
  "total-calories": { field: "total_calories.interval.start_time", type: "physical" },
  "vo2-max": { field: "vo2_max.sample_time.physical_time", type: "physical" },
  weight: { field: "weight.sample_time.physical_time", type: "physical" },
};

export function usesCivilDateWindow(dataType: GoogleHealthDataType) {
  return filterMetadata[dataType].type === "date" || GOOGLE_HEALTH_DAILY_ROLLUP_TYPES.includes(dataType as (typeof GOOGLE_HEALTH_DAILY_ROLLUP_TYPES)[number]);
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function exclusiveCivilEndDate(date: Date) {
  const startOfDay = startOfUtcDay(date);
  if (startOfDay.getTime() === date.getTime()) return dateOnly(startOfDay);
  startOfDay.setUTCDate(startOfDay.getUTCDate() + 1);
  return dateOnly(startOfDay);
}

export function createTimeFilter(dataType: GoogleHealthDataType, start: Date, end: Date) {
  const metadata = filterMetadata[dataType];
  const startValue = metadata.type === "date" ? dateOnly(start) : start.toISOString();
  const endValue = metadata.type === "date" ? exclusiveCivilEndDate(end) : end.toISOString();
  return `${metadata.field} >= "${startValue}" AND ${metadata.field} < "${endValue}"`;
}

export function googleHealthDataPointPageSize(dataType: GoogleHealthDataType) {
  return dataType === "sleep" || dataType === "exercise" ? 25 : 100;
}

export function listGoogleHealthDataPoints(input: {
  accessToken: string;
  dataType: GoogleHealthDataType;
  start: Date;
  end: Date;
  pageToken?: string;
}) {
  const query = new URLSearchParams({
    pageSize: String(googleHealthDataPointPageSize(input.dataType)),
    filter: createTimeFilter(input.dataType, input.start, input.end),
  });
  if (input.pageToken) query.set("pageToken", input.pageToken);
  return googleHealthRequest<DataPointListResponse>(
    `/users/me/dataTypes/${input.dataType}/dataPoints?${query.toString()}`,
    input.accessToken,
  );
}

function civilDateTime(date: Date) {
  return {
    date: {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    },
    time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
  };
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function createDailyRollupRange(start: Date, end: Date, maximumDays = 90) {
  let normalizedStart = startOfUtcDay(start);
  const normalizedEnd = startOfUtcDay(end);
  if (normalizedEnd.getTime() < end.getTime() || normalizedEnd <= normalizedStart) {
    normalizedEnd.setUTCDate(normalizedEnd.getUTCDate() + 1);
  }
  const earliestAllowedStart = new Date(normalizedEnd);
  earliestAllowedStart.setUTCDate(earliestAllowedStart.getUTCDate() - maximumDays);
  if (normalizedStart < earliestAllowedStart) normalizedStart = earliestAllowedStart;
  return { start: civilDateTime(normalizedStart), end: civilDateTime(normalizedEnd) };
}

export function dailyRollupPageSize(dataType: GoogleHealthDataType) {
  return dailyRollupRangeDays(dataType);
}

export function dailyRollupRangeDays(dataType: GoogleHealthDataType) {
  return dataType === "active-minutes" || dataType === "total-calories" || dataType === "calories-in-heart-rate-zone" ? 14 : 90;
}

export function dailyRollUpGoogleHealthData(input: {
  accessToken: string;
  dataType: GoogleHealthDataType;
  start: Date;
  end: Date;
  pageToken?: string;
}) {
  return googleHealthRequest<DailyRollupResponse>(
    `/users/me/dataTypes/${input.dataType}/dataPoints:dailyRollUp`,
    input.accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        range: createDailyRollupRange(input.start, input.end, dailyRollupRangeDays(input.dataType)),
        windowSizeDays: 1,
        pageSize: dailyRollupPageSize(input.dataType),
        ...(input.pageToken ? { pageToken: input.pageToken } : {}),
      }),
    },
  );
}
