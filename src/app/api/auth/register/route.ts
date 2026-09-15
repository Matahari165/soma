import { NextResponse } from "next/server";

import { createCredentialsUser, validateEmail, validatePassword } from "@/lib/auth-credentials";
import { createSession } from "@/lib/cloudflare/session";

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

  if (typeof password !== "string" || !validatePassword(password).valid) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters long." },
      { status: 400 },
    );
  }

  try {
    const user = await createCredentialsUser({
      email,
      password,
      displayName: typeof displayName === "string" ? displayName : undefined,
    });

    await createSession(user.id);

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        hasCompletedOnboarding: false,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account registration failed.";
    const isConflict = message.toLowerCase().includes("already exists");
    return NextResponse.json({ error: message }, { status: isConflict ? 409 : 500 });
  }
}
