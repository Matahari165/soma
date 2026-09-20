import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { onboardingSchema } from "@/domain/profile";
import { completeOnboarding } from "@/services/onboarding";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const parsed = onboardingSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please review the entered information.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await completeOnboarding(user.id, parsed.data);
  return NextResponse.json(result.ok ? result : { error: result.error }, { status: result.ok ? 200 : result.status });
}
