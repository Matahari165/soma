import { NextResponse } from "next/server";

import { findCredentialsByEmail, normalizeEmail, validateEmail } from "@/lib/auth-credentials";
import { sendPasswordRecoveryEmail } from "@/lib/auth-recovery";
import { allowRecoveryAttempt, RECOVERY_RETRY_AFTER_SECONDS } from "@/lib/auth-rate-limit";

const genericResponse = { ok: true, message: "If this address has a Soma password, check its inbox for a recovery link." };

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const email = body && typeof body === "object" && "email" in body ? (body as { email: unknown }).email : null;
  if (typeof email !== "string" || !validateEmail(email).valid) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  try {
    if (!(await allowRecoveryAttempt(request, email))) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, {
        status: 429,
        headers: { "Retry-After": String(RECOVERY_RETRY_AFTER_SECONDS) },
      });
    }
    const credentials = await findCredentialsByEmail(email);
    if (credentials) await sendPasswordRecoveryEmail(normalizeEmail(email));
  } catch {
    // Keep the same public response for unknown accounts and delivery failures.
    console.error("[auth/recovery] request failed");
  }
  return NextResponse.json(genericResponse, { status: 202, headers: { "Cache-Control": "no-store" } });
}
