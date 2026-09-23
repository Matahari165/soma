import { NextResponse } from "next/server";

import { createCredentialsUser, validateEmail, validatePassword } from "@/lib/auth-credentials";
import { allowAuthAttempt, AUTH_RETRY_AFTER_SECONDS } from "@/lib/auth-rate-limit";

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

  const { email, password, displayName } = body as Record<string, unknown>;

  if (typeof email !== "string" || !validateEmail(email).valid) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const passwordCheck = validatePassword(password);
  if (typeof password !== "string" || !passwordCheck.valid) {
    return NextResponse.json(
      { error: passwordCheck.error },
      { status: 400 },
    );
  }

  try {
    if (!(await allowAuthAttempt(request, email))) {
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, {
        status: 429,
        headers: { "Retry-After": String(AUTH_RETRY_AFTER_SECONDS) },
      });
    }
    await createCredentialsUser({
      email,
      password,
      displayName: typeof displayName === "string" ? displayName : undefined,
    });

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account registration failed.";
    const isConflict = message.toLowerCase().includes("already exists");
    if (isConflict) return NextResponse.json({ ok: true }, { status: 202 });
    return NextResponse.json(
      { error: "Account creation is temporarily unavailable. Please try again later." },
      { status: 500 },
    );
  }
}
