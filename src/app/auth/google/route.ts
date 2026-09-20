import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createPkcePair } from "@/lib/crypto";
import { getSiteUrl } from "@/lib/env";
import { googleAuthorizationURL } from "@/lib/google-auth";

function safeNextPath(value: string | null) {
  if (!value || value.length > 200 || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\") || /\s/.test(value) || value.includes("@") || value.includes(":")) return "/";
  return value;
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

  return NextResponse.redirect(googleAuthorizationURL(getSiteUrl(), state, challenge));
}
