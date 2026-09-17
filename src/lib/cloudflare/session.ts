import "server-only";

import { cookies } from "next/headers";

import { cloudflareDb, createCloudflareAdminClient, hasSupabaseRuntime } from "@/lib/cloudflare/db";

export const SESSION_COOKIE = "soma_session";
const SESSION_DAYS = 30;
const SESSION_READ_TIMEOUT_MS = 4_000;

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

export async function createSession(userId: string) {
  const token = randomToken();
  const tokenHash = await sha256(token);
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

  if (hasSupabaseRuntime()) {
    const result = await createCloudflareAdminClient().from("soma_sessions").insert({
      token_hash: tokenHash,
      user_id: userId,
      expires_at: expires.toISOString(),
      created_at: now.toISOString(),
    });
    if (result.error) throw new Error(result.error.message);
    (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
    return { token, cookieOptions };
  }

  const result = await cloudflareDb().prepare(
    "INSERT INTO soma_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).bind(tokenHash, userId, expires.toISOString(), now.toISOString()).run();
  if (!result.success) throw new Error(result.error ?? "Session creation failed.");
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
  return { token, cookieOptions };
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = await sha256(token);
    if (hasSupabaseRuntime()) await createCloudflareAdminClient().from("soma_sessions").delete().eq("token_hash", tokenHash);
    else await cloudflareDb().prepare("DELETE FROM soma_sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
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
