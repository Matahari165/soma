import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function secret(explicit?: string) {
  const value = explicit ?? process.env.SOMA_ASSISTANT_CURSOR_SECRET ?? process.env.TOKEN_ENCRYPTION_KEY;
  if (!value || value.length < 24) throw new Error("Assistant cursor signing is not configured.");
  return value;
}

export function queryFingerprint(userId: string, input: unknown) {
  return createHash("sha256").update(JSON.stringify([userId, input])).digest("hex");
}

export function signScopedCursor<T>(scope: string, value: T, explicitSecret?: string) {
  const body = Buffer.from(JSON.stringify({ scope, value })).toString("base64url");
  const signature = createHmac("sha256", secret(explicitSecret)).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readScopedCursor<T>(token: string, scope: string, explicitSecret?: string): T {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra || token.length > 8192) throw new Error("Invalid assistant cursor.");
  const expected = createHmac("sha256", secret(explicitSecret)).update(body).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error("Invalid assistant cursor.");
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (parsed.scope !== scope) throw new Error("Assistant cursor belongs to another user or query.");
  return parsed.value as T;
}
