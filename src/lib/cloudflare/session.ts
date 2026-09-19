import "server-only";

import { cookies, headers } from "next/headers";

import { cloudflareDb, createCloudflareAdminClient, hasSupabaseRuntime } from "@/lib/cloudflare/db";

export const SESSION_COOKIE = "soma_session";
const SESSION_DAYS = 30;
const SESSION_READ_TIMEOUT_MS = 4_000;

export type SessionPlatform = "web" | "ios" | "macos";

export type DeviceSession = {
  id: string;
  platform: SessionPlatform;
  deviceName: string;
  createdAt: string;
  expiresAt: string;
};

export type SessionUser = {
  id: string;
  email: string | null;
  displayName: string;
};

function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Buffer.from(value).toString("base64url");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}

export async function createSession(userId: string, device: { platform?: SessionPlatform; deviceName?: string; setCookie?: boolean } = {}) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + SESSION_DAYS);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
  const platform = device.platform ?? "web";
  const deviceName = device.deviceName?.trim().slice(0, 80) || (platform === "web" ? "Web browser" : platform === "ios" ? "iPhone" : "Mac");
  const setCookie = device.setCookie ?? platform === "web";

  if (hasSupabaseRuntime()) {
    const result = await createCloudflareAdminClient().from("soma_sessions").insert({
      token_hash: tokenHash,
      session_id: sessionId,
      user_id: userId,
      platform,
      device_name: deviceName,
      expires_at: expires.toISOString(),
      created_at: now.toISOString(),
    });
    if (result.error) throw new Error(result.error.message);
    if (setCookie) (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
    return { token, cookieOptions, session: { id: sessionId, platform, deviceName, createdAt: now.toISOString(), expiresAt: expires.toISOString() } satisfies DeviceSession };
  }

  const result = await cloudflareDb().prepare(
    "INSERT INTO soma_sessions (token_hash, session_id, user_id, platform, device_name, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(tokenHash, sessionId, userId, platform, deviceName, expires.toISOString(), now.toISOString()).run();
  if (!result.success) throw new Error(result.error ?? "Session creation failed.");
  if (setCookie) (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
  return { token, cookieOptions, session: { id: sessionId, platform, deviceName, createdAt: now.toISOString(), expiresAt: expires.toISOString() } satisfies DeviceSession };
}

function bearerToken(value: string | null) {
  const match = value?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/);
  return match?.[1] ?? null;
}

export async function currentSessionToken() {
  const authorization = (await headers()).get("authorization");
  return bearerToken(authorization) ?? (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

async function currentBearerToken() {
  return bearerToken((await headers()).get("authorization"));
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const authorizationToken = bearerToken((await headers()).get("authorization"));
  const token = authorizationToken ?? cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (token) {
    const tokenHash = await sha256(token);
    if (hasSupabaseRuntime()) await createCloudflareAdminClient().from("soma_sessions").delete().eq("token_hash", tokenHash);
    else await cloudflareDb().prepare("DELETE FROM soma_sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  if (!authorizationToken) cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await currentSessionToken();
  return getSessionUserForToken(token);
}

export async function getBearerSessionUser(): Promise<SessionUser | null> {
  return getSessionUserForToken(await currentBearerToken());
}

export async function getBearerDeviceSession(): Promise<DeviceSession | null> {
  const token = await currentBearerToken();
  if (!token) return null;
  const tokenHash = await sha256(token);
  if (!hasSupabaseRuntime()) {
    const row = await cloudflareDb().prepare("SELECT session_id, platform, device_name, created_at, expires_at FROM soma_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1").bind(tokenHash, new Date().toISOString()).first<{ session_id: string | null; platform: string | null; device_name: string | null; created_at: string; expires_at: string }>();
    return row ? sessionFromRow(row)[0] ?? null : null;
  }
  const result = await createCloudflareAdminClient().from("soma_sessions").select("session_id,platform,device_name,created_at,expires_at").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? sessionFromRow(result.data)[0] ?? null : null;
}

async function getSessionUserForToken(token: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  if (hasSupabaseRuntime()) {
    try {
      const admin = createCloudflareAdminClient();
      const tokenHash = await sha256(token);
      const sessionResult = await admin
        .from("soma_sessions")
        .select("user_id,expires_at")
        .eq("token_hash", tokenHash)
        .withTimeout(SESSION_READ_TIMEOUT_MS)
        .maybeSingle();

      if (sessionResult.error) {
        console.error("[session] soma_sessions lookup error:", sessionResult.error);
        return null;
      }
      if (!sessionResult.data || new Date(sessionResult.data.expires_at).getTime() <= Date.now()) {
        return null;
      }

      const userResult = await admin
        .from("soma_users")
        .select("id,email,display_name")
        .eq("id", sessionResult.data.user_id)
        .withTimeout(SESSION_READ_TIMEOUT_MS)
        .maybeSingle();

      if (userResult.error) {
        console.error("[session] soma_users lookup error:", userResult.error);
        return null;
      }
      if (!userResult.data) return null;

      return {
        id: userResult.data.id,
        email: typeof userResult.data.email === "string" ? userResult.data.email : null,
        displayName: typeof userResult.data.display_name === "string" ? userResult.data.display_name : "Soma user",
      };
    } catch (err) {
      console.error("[session] getSessionUser failed:", err);
      return null;
    }
  }
  const row = await cloudflareDb().prepare(`
    SELECT users.id, users.email, users.display_name
    FROM soma_sessions AS sessions
    JOIN soma_users AS users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    LIMIT 1
  `).bind(await sha256(token), new Date().toISOString()).first<{ id: string; email: string | null; display_name: string }>();
  return row ? { id: row.id, email: row.email, displayName: row.display_name } : null;
}

export async function listDeviceSessions(userId: string): Promise<DeviceSession[]> {
  if (!hasSupabaseRuntime()) {
    const result = await cloudflareDb().prepare("SELECT session_id, platform, device_name, created_at, expires_at FROM soma_sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC").bind(userId, new Date().toISOString()).all<{ session_id: string | null; platform: string | null; device_name: string | null; created_at: string; expires_at: string }>();
    if (!result.success) throw new Error(result.error ?? "Sessions could not be loaded.");
    return (result.results ?? []).flatMap(sessionFromRow);
  }
  const result = await createCloudflareAdminClient().from("soma_sessions").select("session_id,platform,device_name,created_at,expires_at").eq("user_id", userId).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).flatMap(sessionFromRow);
}

function sessionFromRow(row: { session_id?: unknown; platform?: unknown; device_name?: unknown; created_at?: unknown; expires_at?: unknown }): DeviceSession[] {
  if (typeof row.session_id !== "string" || typeof row.created_at !== "string" || typeof row.expires_at !== "string") return [];
  const platform = row.platform === "ios" || row.platform === "macos" ? row.platform : "web";
  return [{ id: row.session_id, platform, deviceName: typeof row.device_name === "string" ? row.device_name : "Unknown device", createdAt: row.created_at, expiresAt: row.expires_at }];
}

export async function revokeDeviceSession(userId: string, sessionId: string) {
  if (hasSupabaseRuntime()) {
    const result = await createCloudflareAdminClient().from("soma_sessions").delete().eq("user_id", userId).eq("session_id", sessionId).select("token_hash");
    if (result.error) throw new Error(result.error.message);
    return (result.data?.length ?? 0) > 0;
  }
  const result = await cloudflareDb().prepare("DELETE FROM soma_sessions WHERE user_id = ? AND session_id = ?").bind(userId, sessionId).run();
  if (!result.success) throw new Error(result.error ?? "Session could not be revoked.");
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function hasCompletedOnboarding(userId: string) {
  if (hasSupabaseRuntime()) {
    const result = await createCloudflareAdminClient().from("profiles").select("onboarding_completed_at").eq("user_id", userId).maybeSingle();
    return Boolean(result.data?.onboarding_completed_at);
  }
  const row = await cloudflareDb().prepare(`
    SELECT 1
    FROM soma_rows
    WHERE table_name = 'profiles'
      AND user_id = ?
      AND json_extract(json_data, '$.onboarding_completed_at') IS NOT NULL
    LIMIT 1
  `).bind(userId).first();
  return Boolean(row);
}

export async function upsertGoogleUser(profile: { sub: string; email?: string; name?: string; picture?: string }) {
  if (hasSupabaseRuntime()) {
    const admin = createCloudflareAdminClient();
    const existingResult = await admin.from("soma_users").select("id").eq("google_subject", profile.sub).maybeSingle();
    if (existingResult.error) throw new Error(existingResult.error.message);
    const id = existingResult.data?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const displayName = profile.name?.trim() || profile.email?.split("@")[0] || "Soma user";
    const result = await admin.from("soma_users").upsert({ id, google_subject: profile.sub, email: profile.email ?? null, display_name: displayName, avatar_url: profile.picture ?? null, created_at: now, updated_at: now }, { onConflict: "google_subject" });
    if (result.error) throw new Error(result.error.message);
    return { id, email: profile.email ?? null, displayName };
  }
  const db = cloudflareDb();
  const existing = await db.prepare("SELECT id FROM soma_users WHERE google_subject = ? LIMIT 1").bind(profile.sub).first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const displayName = profile.name?.trim() || profile.email?.split("@")[0] || "Soma user";
  const result = await db.prepare(`
    INSERT INTO soma_users (id, google_subject, email, display_name, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(google_subject) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at
  `).bind(id, profile.sub, profile.email ?? null, displayName, profile.picture ?? null, now, now).run();
  if (!result.success) throw new Error(result.error ?? "User creation failed.");
  return { id, email: profile.email ?? null, displayName };
}
