import {
  listGoogleHealthDataPoints,
  type DataPointListResponse,
} from "./client";

// Heart-rate data pages contain up to 1,000 points. This limit covers a full
// 24-hour window at one sample per second while keeping a hard bound on work.
export const GOOGLE_HEALTH_SESSION_HEART_RATE_MAX_PAGES = 128;
export const GOOGLE_HEALTH_SESSION_ZONE_MAX_PAGES = 2;

type SessionDataType = "heart-rate" | "daily-heart-rate-zones";
type SessionPageReader = (input: {
  accessToken: string;
  dataType: SessionDataType;
  start: Date;
  end: Date;
  pageToken?: string;
}) => Promise<DataPointListResponse>;

async function listBoundedSessionData(input: {
  accessToken: string;
  dataType: SessionDataType;
  start: Date;
  end: Date;
  maxPages: number;
}, readPage: SessionPageReader) {
  const durationMs = input.end.getTime() - input.start.getTime();
  const maximumWindowMs = input.dataType === "daily-heart-rate-zones" ? 4 * 24 * 60 * 60 * 1_000 : 24 * 60 * 60 * 1_000;
  if (!Number.isFinite(input.start.getTime()) || !Number.isFinite(input.end.getTime()) || durationMs <= 0 || durationMs > maximumWindowMs) {
    throw new Error("Google Health session data range is invalid or too large.");
  }
  const dataPoints: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;
  const requestedPageTokens = new Set<string>();
  while (pageCount < input.maxPages) {
    if (pageToken) {
      if (requestedPageTokens.has(pageToken)) {
        throw new Error("Google Health session pagination repeated a page token.");
      }
      requestedPageTokens.add(pageToken);
    }
    const response = await readPage({
      accessToken: input.accessToken,
      dataType: input.dataType,
      start: input.start,
      end: input.end,
      ...(pageToken ? { pageToken } : {}),
    });
    dataPoints.push(...(response.dataPoints ?? []));
    pageCount += 1;
    pageToken = response.nextPageToken;
    if (pageToken && requestedPageTokens.has(pageToken)) {
      throw new Error("Google Health session pagination repeated a page token.");
    }
    if (!pageToken) break;
  }
  return { dataPoints, pageCount, limited: Boolean(pageToken) };
}

/** Fetches a bounded number of raw samples for one activity window. */
export function fetchGoogleHealthSessionHeartRate(
  input: { accessToken: string; start: Date; end: Date },
  readPage: SessionPageReader = listGoogleHealthDataPoints,
) {
  return listBoundedSessionData({ ...input, dataType: "heart-rate", maxPages: GOOGLE_HEALTH_SESSION_HEART_RATE_MAX_PAGES }, readPage);
}

/** Gets nearby civil-date zone records; callers select the exercise's local day. */
export function fetchGoogleHealthSessionDailyZones(
  input: { accessToken: string; start: Date; end: Date },
  readPage: SessionPageReader = listGoogleHealthDataPoints,
) {
  const start = new Date(input.start.getTime() - 24 * 60 * 60 * 1_000);
  const end = new Date(input.end.getTime() + 24 * 60 * 60 * 1_000);
  return listBoundedSessionData({ accessToken: input.accessToken, dataType: "daily-heart-rate-zones", start, end, maxPages: GOOGLE_HEALTH_SESSION_ZONE_MAX_PAGES }, readPage);
}
