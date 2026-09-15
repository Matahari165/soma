import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getAiUsageSummary } from "@/services/ai-cost-tracking";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const summary = await getAiUsageSummary(user.id);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AI usage.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
