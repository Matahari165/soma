import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { buildGoogleCalendarAuthorizationUrl } from "@/integrations/google-calendar/client";
import { getCurrentUser } from "@/lib/auth";
import { createPkcePair } from "@/lib/crypto";
import { isLocalPreviewMode } from "@/lib/env";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (isLocalPreviewMode()) return NextResponse.redirect(new URL("/settings?calendar=connected", request.url));
  const state = randomBytes(32).toString("base64url");
  const { verifier, challenge } = createPkcePair();
  let response: NextResponse;
  try {
    response = NextResponse.redirect(buildGoogleCalendarAuthorizationUrl(state, challenge));
  } catch (error) {
    console.error("Google Calendar OAuth configuration is invalid.", error instanceof Error ? error.message : "Unknown error.");
    return NextResponse.redirect(new URL("/settings?calendar=unavailable", request.url));
  }
  const secure = new URL(request.url).protocol === "https:";
  const options = { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 600 };
  response.cookies.set("soma_calendar_oauth_state", state, options);
  response.cookies.set("soma_calendar_pkce", verifier, options);
  return response;
}
