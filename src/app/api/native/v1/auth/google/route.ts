import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createPkcePair } from "@/lib/crypto";
import { getSiteUrl } from "@/lib/env";
import { encodeNativeGoogleAuthContext, googleAuthorizationURL, NATIVE_AUTH_CONTEXT_COOKIE } from "@/lib/google-auth";

const querySchema = z.object({
  platform: z.enum(["ios", "macos"]),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    platform: url.searchParams.get("platform"),
    codeChallenge: url.searchParams.get("code_challenge"),
    state: url.searchParams.get("state"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid native authentication request." }, { status: 400 });

  const googleState = crypto.randomUUID();
  const { verifier, challenge } = createPkcePair();
  const cookieStore = await cookies();
  const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 10 * 60 };
  cookieStore.set("soma_native_oauth_state", googleState, cookieOptions);
  cookieStore.set("soma_native_oauth_verifier", verifier, cookieOptions);
  cookieStore.set(NATIVE_AUTH_CONTEXT_COOKIE, encodeNativeGoogleAuthContext({
    platform: parsed.data.platform,
    pkceChallenge: parsed.data.codeChallenge,
    state: parsed.data.state,
  }), cookieOptions);

  return NextResponse.redirect(googleAuthorizationURL(getSiteUrl(), googleState, challenge));
}
