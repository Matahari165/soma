import { getSiteUrl, requireServerEnv } from "@/lib/env";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const CLIENT_ID_PATTERN = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

export type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: "Bearer";
};

export class GoogleCalendarRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Google Calendar request failed (${status}).`);
    this.name = "GoogleCalendarRequestError";
  }
}

function calendarClientId() {
  const clientId = (process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_HEALTH_CLIENT_ID || "").trim();
  if (!CLIENT_ID_PATTERN.test(clientId)) throw new Error("Google Calendar OAuth client ID is not valid.");
  return clientId;
}

function calendarClientSecret() {
  return process.env.GOOGLE_CALENDAR_CLIENT_SECRET || requireServerEnv("GOOGLE_HEALTH_CLIENT_SECRET");
}

export function getGoogleCalendarRedirectUri(siteUrlValue = getSiteUrl()) {
  const siteUrl = new URL(siteUrlValue);
  if (siteUrl.protocol !== "https:" && siteUrl.hostname !== "localhost") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside localhost.");
  }
  return new URL("/api/calendar/google/callback", siteUrl.origin).toString();
}

export function buildGoogleCalendarAuthorizationUrl(state: string, challenge: string, siteUrl = getSiteUrl()) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", calendarClientId());
  url.searchParams.set("redirect_uri", getGoogleCalendarRedirectUri(siteUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
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
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new GoogleCalendarRequestError(response.status);
  return (await response.json()) as TokenResponse;
}

export function exchangeGoogleCalendarCode(code: string, verifier: string, siteUrl = getSiteUrl()) {
  return tokenRequest(new URLSearchParams({
    client_id: calendarClientId(),
    client_secret: calendarClientSecret(),
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: getGoogleCalendarRedirectUri(siteUrl),
  }));
}

export function refreshGoogleCalendarToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({
    client_id: calendarClientId(),
    client_secret: calendarClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }));
}

export async function listPrimaryCalendarEvents(input: {
  accessToken: string;
  start: Date;
  end: Date;
  timeZone: string;
}) {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${CALENDAR_API_BASE}/calendars/primary/events`);
    url.searchParams.set("timeMin", input.start.toISOString());
    url.searchParams.set("timeMax", input.end.toISOString());
    url.searchParams.set("timeZone", input.timeZone);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("fields", "items(id,status,summary,start,end),nextPageToken");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new GoogleCalendarRequestError(response.status);
    const body = await response.json() as { items?: GoogleCalendarEvent[]; nextPageToken?: string };
    events.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return events;
}
