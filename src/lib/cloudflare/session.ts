import "server-only";

import { cookies } from "next/headers";

import { cloudflareDb } from "@/lib/cloudflare/db";

const SESSION_COOKIE = "soma_session";
const SESSION_DAYS = 30;

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
  const result = await cloudflareDb().prepare(
    "INSERT INTO soma_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).bind(tokenHash, userId, expires.toISOString(), now.toISOString()).run();
  if (!result.success) throw new Error(result.error ?? "Session creation failed.");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await cloudflareDb().prepare("DELETE FROM soma_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await cloudflareDb().prepare(`
    SELECT users.id, users.email, users.display_name
    FROM soma_sessions AS sessions
    JOIN soma_users AS users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    LIMIT 1
  `).bind(await sha256(token), new Date().toISOString()).first<{ id: string; email: string | null; display_name: string }>();
  return row ? { id: row.id, email: row.email, displayName: row.display_name } : null;
}

export async function upsertGoogleUser(profile: { sub: string; email?: string; name?: string; picture?: string }) {
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
