import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { loadAssistantStarterPrompts } from "@/modules/assistant/load-starter-prompts";
import { selectStarterPrompts } from "@/modules/assistant/starter-prompts";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", code: "unauthorized" }, { status: 401, headers });
  if (isLocalPreviewMode()) {
    const prompts = selectStarterPrompts({ hasGoals: false, hasRunning: true, hasEffort: false, hasSleep: false, hasRecovery: false, hasMeals: false })
      .map((prompt) => prompt.id === "running"
        ? { ...prompt, text: "Que montrent mes courses fictives des trois dernières semaines : volume, allure et fréquence cardiaque ?" }
        : prompt);
    return NextResponse.json({ calibrated: true, prompts, preview: true }, { headers });
  }
  try {
    return NextResponse.json(await loadAssistantStarterPrompts(user.id), { headers });
  } catch {
    return NextResponse.json({ error: "L’accueil de Soma n’a pas pu être chargé." }, { status: 503, headers });
  }
}
