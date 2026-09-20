import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { requireServerEnv } from "@/lib/env";

export const NATIVE_AUTH_CONTEXT_COOKIE = "soma_oauth_native_context";

const nativeContextSchema = z.object({
  platform: z.enum(["ios", "macos"]),
  pkceChallenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});

export type NativeGoogleAuthContext = z.infer<typeof nativeContextSchema>;

export function nativeAuthCallback(platform: "ios" | "macos") {
  return `com.soma.native.${platform}://auth/callback`;
}

export function googleAuthCredentials() {
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_AUTH_CLIENT_SECRET;
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error("GOOGLE_AUTH_CLIENT_ID and GOOGLE_AUTH_CLIENT_SECRET must be configured together.");
  }
  return clientId && clientSecret
    ? { clientId, clientSecret }
    : { clientId: requireServerEnv("GOOGLE_HEALTH_CLIENT_ID"), clientSecret: requireServerEnv("GOOGLE_HEALTH_CLIENT_SECRET") };
}

export function googleAuthClientId() {
  return googleAuthCredentials().clientId;
}

export function googleAuthorizationURL(origin: string, state: string, challenge: string) {
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.searchParams.set("client_id", googleAuthClientId());
  authorization.searchParams.set("redirect_uri", new URL("/auth/callback", origin).toString());
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "openid email profile");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");
  authorization.searchParams.set("prompt", "select_account");
  return authorization;
}

export function encodeNativeGoogleAuthContext(context: NativeGoogleAuthContext) {
  const payload = Buffer.from(JSON.stringify(nativeContextSchema.parse(context))).toString("base64url");
  const signature = createHmac("sha256", requireServerEnv("TOKEN_ENCRYPTION_KEY")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function decodeNativeGoogleAuthContext(value: string | undefined) {
  if (!value) return null;
  try {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", requireServerEnv("TOKEN_ENCRYPTION_KEY")).update(payload).digest();
    const received = Buffer.from(signature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    return nativeContextSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}
