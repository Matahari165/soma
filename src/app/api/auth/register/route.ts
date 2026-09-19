import { NextResponse } from "next/server";

import { createCredentialsUser, validateEmail, validatePassword } from "@/lib/auth-credentials";

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
    const user = await createCredentialsUser({
      email,
      password,
      displayName: typeof displayName === "string" ? displayName : undefined,
    });

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account registration failed.";
    const isConflict = message.toLowerCase().includes("already exists");
    return NextResponse.json(
      { error: isConflict ? message : "Account creation is temporarily unavailable. Please try again later." },
      { status: isConflict ? 409 : 500 },
    );
  }
}
