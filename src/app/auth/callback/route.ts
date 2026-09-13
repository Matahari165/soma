import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createSession, hasCompletedOnboarding, upsertGoogleUser } from "@/lib/cloudflare/session";
import { requireServerEnv } from "@/lib/env";

type GoogleProfile = { sub?: unknown; email?: unknown; name?: unknown; picture?: unknown };

function loginError(origin: string, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, origin));
}

function safeNextPath(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function postLoginDestination(nextPath: string, onboardingCompleted: boolean) {
  if (!onboardingCompleted) return "/onboarding";
  return nextPath === "/onboarding" ? "/" : nextPath;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  let stage = "input";
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookieStore.get("soma_oauth_state")?.value;
  const verifier = cookieStore.get("soma_oauth_verifier")?.value;
  const nextPath = safeNextPath(cookieStore.get("soma_oauth_next")?.value);
  if (!code || !state || !expectedState || state !== expectedState || !verifier) return loginError(url.origin, "oauth_state");

  try {
    stage = "token_exchange";
    const tokens = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_AUTH_CLIENT_ID ?? requireServerEnv("GOOGLE_HEALTH_CLIENT_ID"),
        client_secret: process.env.GOOGLE_AUTH_CLIENT_SECRET ?? requireServerEnv("GOOGLE_HEALTH_CLIENT_SECRET"),
        redirect_uri: new URL("/auth/callback", url.origin).toString(),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const tokenPayload = await tokens.json().catch(() => null) as { access_token?: unknown } | null;
    if (!tokens.ok || typeof tokenPayload?.access_token !== "string") {
      console.error("[auth/callback] Google token exchange failed", { status: tokens.status });
      return loginError(url.origin, "oauth_callback");
    }
    stage = "profile_fetch";
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const profile = await response.json().catch(() => null) as GoogleProfile | null;
    if (!response.ok || typeof profile?.sub !== "string") {
      console.error("[auth/callback] Google profile fetch failed", { status: response.status });
      return loginError(url.origin, "oauth_profile");
    }
    stage = "user_upsert";
    const user = await upsertGoogleUser({
      sub: profile.sub,
      email: typeof profile.email === "string" ? profile.email : undefined,
      name: typeof profile.name === "string" ? profile.name : undefined,
      picture: typeof profile.picture === "string" ? profile.picture : undefined,
    });
    stage = "onboarding_lookup";
    const onboardingCompleted = await hasCompletedOnboarding(user.id);
    stage = "session_create";
    await createSession(user.id);
    cookieStore.delete("soma_oauth_state");
    cookieStore.delete("soma_oauth_verifier");
    cookieStore.delete("soma_oauth_next");
    return NextResponse.redirect(new URL(postLoginDestination(nextPath, onboardingCompleted), url.origin));
  } catch (error) {
    console.error("[auth/callback] OAuth callback failed", {
      stage,
      message: error instanceof Error ? error.message.slice(0, 240) : "Unknown error",
    });
    return loginError(url.origin, "oauth_callback");
  }
}
