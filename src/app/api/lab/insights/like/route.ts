import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

const schema = z.object({ id: z.string().uuid(), liked: z.boolean() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid insight." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const admin = createCloudflareAdminClient();
  const { data, error } = await admin.from("lab_narrative_history")
    .update({ liked: parsed.data.liked })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "This feedback could not be saved." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Insight not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
