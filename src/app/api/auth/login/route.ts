import { NextResponse } from "next/server";

import { verifyCredentialsLogin } from "@/lib/auth-credentials";
import { allowAuthAttempt, AUTH_RETRY_AFTER_SECONDS } from "@/lib/auth-rate-limit";
import { createSession, hasCompletedOnboarding } from "@/lib/cloudflare/session";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const { email, password } = body as Record<string, unknown>;

  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  try {
    if (!(await allowAuthAttempt(request, email))) {
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, {
        status: 429,
        headers: { "Retry-After": String(AUTH_RETRY_AFTER_SECONDS) },
      });
    }
    const user = await verifyCredentialsLogin({ email, password });
    const { token, cookieOptions } = await createSession(user.id);
    const onboarded = await hasCompletedOnboarding(user.id);

    const response = NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        hasCompletedOnboarding: onboarded,
      },
      { status: 200 },
    );
    response.cookies.set("soma_session", token, cookieOptions);
    return response;
  } catch (error) {
    const invalid = error instanceof Error && error.message === "Invalid email or password.";
    return NextResponse.json(
      { error: invalid ? "Invalid email or password." : "Sign in is temporarily unavailable. Please try again later." },
      { status: invalid ? 401 : 503 },
    );
  }
}
