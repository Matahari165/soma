import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { buildGoogleHealthAuthorizationUrl } from "@/integrations/google-health/client";
import { getCurrentUser } from "@/lib/auth";
import { createPkcePair } from "@/lib/crypto";
import { isLocalPreviewMode } from "@/lib/env";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const source = new URL(request.url).searchParams.get("source") === "onboarding" ? "onboarding" : "settings";
  if (isLocalPreviewMode()) return NextResponse.redirect(new URL(source === "onboarding" ? "/" : "/settings?health=connected", request.url));
  const state = randomBytes(32).toString("base64url");
  const { verifier, challenge } = createPkcePair();
  let response: NextResponse;
  try {
    response = NextResponse.redirect(buildGoogleHealthAuthorizationUrl(state, challenge));
  } catch (error) {
    console.error("Google Health OAuth configuration is invalid.", error instanceof Error ? error.message : "Unknown configuration error.");
    return NextResponse.redirect(new URL(`/settings?health=unavailable&source=${source}`, request.url));
  }
  const secure = new URL(request.url).protocol === "https:";
  const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 600 };
  response.cookies.set("soma_health_oauth_state", state, cookieOptions);
  response.cookies.set("soma_health_pkce", verifier, cookieOptions);
  response.cookies.set("soma_health_return", source === "onboarding" ? "dashboard" : "settings", cookieOptions);
  return response;
}
