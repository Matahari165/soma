import "server-only";

import { requireServerEnv } from "@/lib/env";

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
