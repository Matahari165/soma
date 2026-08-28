import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createPkcePair } from "@/lib/crypto";
import { requireServerEnv } from "@/lib/env";

function safeNextPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const state = crypto.randomUUID();
  const { verifier, challenge } = createPkcePair();
  const cookieStore = await cookies();
  const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 10 * 60 };
  cookieStore.set("soma_oauth_state", state, cookieOptions);
  cookieStore.set("soma_oauth_verifier", verifier, cookieOptions);
  cookieStore.set("soma_oauth_next", safeNextPath(requestUrl.searchParams.get("next")), cookieOptions);

  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.searchParams.set("client_id", process.env.GOOGLE_AUTH_CLIENT_ID ?? requireServerEnv("GOOGLE_HEALTH_CLIENT_ID"));
  authorization.searchParams.set("redirect_uri", new URL("/auth/callback", requestUrl.origin).toString());
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "openid email profile");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");
  authorization.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(authorization);
}
