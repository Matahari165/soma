import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createNativeAuthCode, createSession, hasCompletedOnboarding, upsertGoogleUser } from "@/lib/cloudflare/session";
import { getSiteUrl } from "@/lib/env";
import { decodeNativeGoogleAuthContext, googleAuthCredentials, nativeAuthCallback, NATIVE_AUTH_CONTEXT_COOKIE } from "@/lib/google-auth";

type GoogleProfile = { sub?: unknown; email?: unknown; name?: unknown; picture?: unknown };

function loginError(origin: string, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, origin));
}

function nativeResult(context: NonNullable<ReturnType<typeof decodeNativeGoogleAuthContext>>, values: { code?: string; error?: string }) {
  const callback = new URL(nativeAuthCallback(context.platform));
  callback.searchParams.set("state", context.state);
  if (values.code) callback.searchParams.set("code", values.code);
  if (values.error) callback.searchParams.set("error", values.error);
  return NextResponse.redirect(callback);
}

function clearWebOAuthCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.delete("soma_oauth_state");
  cookieStore.delete("soma_oauth_verifier");
  cookieStore.delete("soma_oauth_next");
}

function clearNativeOAuthCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.delete("soma_native_oauth_state");
  cookieStore.delete("soma_native_oauth_verifier");
  cookieStore.delete(NATIVE_AUTH_CONTEXT_COOKIE);
}

function safeNextPath(value: string | undefined) {
  if (!value || value.length > 200 || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\") || /\s/.test(value) || value.includes("@") || value.includes(":")) return "/";
  return value;
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
  const nativeContext = decodeNativeGoogleAuthContext(cookieStore.get(NATIVE_AUTH_CONTEXT_COOKIE)?.value);
  const nativeState = cookieStore.get("soma_native_oauth_state")?.value;
  const webState = cookieStore.get("soma_oauth_state")?.value;
  const matchesNative = Boolean(state && nativeState && state === nativeState);
  const matchesWeb = Boolean(state && webState && state === webState);
  const flow: "native" | "web" | null = matchesNative === matchesWeb ? null : matchesNative ? "native" : "web";
  const failure = (error: string) => {
    if (flow === "native") clearNativeOAuthCookies(cookieStore);
    else if (flow === "web") clearWebOAuthCookies(cookieStore);
    return flow === "native" && nativeContext ? nativeResult(nativeContext, { error }) : loginError(getSiteUrl(), error);
  };
  if (!flow) return loginError(getSiteUrl(), "oauth_state");
  const isNative = flow === "native";
  const verifier = cookieStore.get(isNative ? "soma_native_oauth_verifier" : "soma_oauth_verifier")?.value;
  const nextPath = flow === "web" ? safeNextPath(cookieStore.get("soma_oauth_next")?.value) : "/";
  if (isNative && !nativeContext) return failure("oauth_state");
  if (!verifier) return failure("oauth_state");
  const providerError = url.searchParams.get("error");
  if (providerError) return failure(providerError === "access_denied" ? "cancelled" : "oauth_provider");
  if (!code) return failure("oauth_state");

  try {
    stage = "token_exchange";
    const tokens = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleAuthCredentials().clientId,
        client_secret: googleAuthCredentials().clientSecret,
        redirect_uri: new URL("/auth/callback", getSiteUrl()).toString(),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const tokenPayload = await tokens.json().catch(() => null) as { access_token?: unknown } | null;
    if (!tokens.ok || typeof tokenPayload?.access_token !== "string") {
      console.error("[auth/callback] Google token exchange failed", { status: tokens.status });
      return failure("oauth_callback");
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
      return failure("oauth_profile");
    }
    stage = "user_upsert";
    const user = await upsertGoogleUser({
      sub: profile.sub,
      email: typeof profile.email === "string" ? profile.email : undefined,
      name: typeof profile.name === "string" ? profile.name : undefined,
      picture: typeof profile.picture === "string" ? profile.picture : undefined,
    });
    if (isNative && nativeContext) {
      stage = "native_code_create";
      const nativeCode = await createNativeAuthCode(user.id, nativeContext);
      clearNativeOAuthCookies(cookieStore);
      return nativeResult(nativeContext, { code: nativeCode });
    }
    stage = "onboarding_lookup";
    const onboardingCompleted = await hasCompletedOnboarding(user.id);
    stage = "session_create";
    await createSession(user.id);
    clearWebOAuthCookies(cookieStore);
    return NextResponse.redirect(new URL(postLoginDestination(nextPath, onboardingCompleted), getSiteUrl()));
  } catch (error) {
    console.error("[auth/callback] OAuth callback failed", {
      stage,
      message: error instanceof Error ? error.message.slice(0, 240) : "Unknown error",
    });
    return failure("oauth_callback");
  }
}
