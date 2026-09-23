import { createHmac } from "node:crypto";

import { consumeAuthAttempt } from "@/lib/cloudflare/db";

const WINDOW_MS = 15 * 60_000;

function hashed(value: string): string {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("Auth limit key is unavailable.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Limits account guessing across all server instances without storing an email address. */
export async function allowAuthAttempt(request: Request, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const accountKey = `account:${hashed(normalized)}`;
  const accountAllowed = await consumeAuthAttempt(accountKey, 10, WINDOW_MS);
  const verifiedIp = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (!verifiedIp) return accountAllowed;
  const ipKey = `ip:${hashed(verifiedIp)}`;
  const ipAllowed = await consumeAuthAttempt(ipKey, 100, WINDOW_MS);
  return accountAllowed && ipAllowed;
}

export const AUTH_RETRY_AFTER_SECONDS = 15 * 60;
