import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { buildGoogleHealthAuthorizationUrl } from "@/integrations/google-health/client";
import { getCurrentUser } from "@/lib/auth";
import { createPkcePair } from "@/lib/crypto";
import { getDataMode } from "@/lib/env";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (getDataMode() === "demo") return NextResponse.redirect(new URL("/settings?health=demo", request.url));

  const state = randomBytes(32).toString("base64url");
  const { verifier, challenge } = createPkcePair();
  const response = NextResponse.redirect(buildGoogleHealthAuthorizationUrl(state, challenge));
  const secure = new URL(request.url).protocol === "https:";
  const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 600 };
  response.cookies.set("soma_health_oauth_state", state, cookieOptions);
  response.cookies.set("soma_health_pkce", verifier, cookieOptions);
  return response;
}
