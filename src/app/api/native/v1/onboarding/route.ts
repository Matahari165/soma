import { NextResponse } from "next/server";

import { onboardingSchema } from "@/domain/profile";
import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { completeOnboarding } from "@/services/onboarding";

export async function POST(request: Request) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = onboardingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please review the entered information." }, { status: 400 });

  const result = await completeOnboarding(user.id, parsed.data);
  return NextResponse.json(result.ok ? result : { error: result.error }, { status: result.ok ? 200 : result.status });
}
