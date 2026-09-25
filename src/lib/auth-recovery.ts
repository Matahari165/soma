import "server-only";

import { createSupabaseRequest } from "@/lib/cloudflare/db-supabase";
import { generateSalt, hashPassword } from "@/lib/auth-credentials";

const AUTH_TIMEOUT_MS = 10_000;

function authConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Recovery authentication is not configured.");
  return { url, key };
}

function recoveryRedirect() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) throw new Error("Recovery redirect is not configured.");
  const url = new URL("/login?reset=1", siteUrl);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Recovery redirect must use HTTPS.");
  }
  return url.toString();
}

/** Supabase sends its one-use magic link only for an existing Soma password account. */
export async function sendPasswordRecoveryEmail(email: string) {
  const { url, key } = authConfig();
  const redirectTo = recoveryRedirect();
  const response = await fetch(`${url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: true }),
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Recovery email provider failed (${response.status}).`);
}

/** Checks the bearer token with Supabase Auth; a decoded JWT alone is insufficient. */
export async function verifiedRecoveryIdentity(accessToken: string): Promise<string | null> {
  const { url, key } = authConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Recovery identity provider failed (${response.status}).`);
  const user = await response.json() as { id?: unknown; email_confirmed_at?: unknown };
  return typeof user.id === "string" && typeof user.email_confirmed_at === "string" ? user.id : null;
}

/** The database redeems this token and changes the password in one transaction. */
export async function completePasswordRecovery(authUserId: string, accessToken: string, password: string): Promise<boolean> {
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const tokenDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
  const tokenHash = Array.from(new Uint8Array(tokenDigest), (b) => b.toString(16).padStart(2, "0")).join("");
  return createSupabaseRequest()<boolean>("rpc/complete_soma_password_recovery", {
    method: "POST",
    body: JSON.stringify({
      p_auth_user_id: authUserId,
      p_token_hash: tokenHash,
      p_password_hash: passwordHash,
      p_salt: salt,
    }),
  });
}
