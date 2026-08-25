import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

const widgetSchema = z.object({ id: z.enum(["weekly-effort", "recovery-trend", "sleep-regularity"]), visible: z.boolean() });
const layoutSchema = z.object({ widgets: z.array(widgetSchema).length(3).refine((widgets) => new Set(widgets.map((widget) => widget.id)).size === 3) });
const defaultLayout = { widgets: ["weekly-effort", "recovery-trend", "sleep-regularity"].map((id) => ({ id, visible: true })) };

export async function GET() {
  if (isLocalPreviewMode()) return NextResponse.json(defaultLayout);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createCloudflareAdminClient();
  const { data, error } = await admin.from("dashboard_layouts").select("layout").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Dashboard layout could not be loaded." }, { status: 500 });
  const parsed = layoutSchema.safeParse(data?.layout);
  return NextResponse.json(parsed.success ? parsed.data : defaultLayout);
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = layoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dashboard layout is invalid." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json(parsed.data);
  const admin = createCloudflareAdminClient();
  const { error } = await admin.from("dashboard_layouts").upsert({ user_id: user.id, layout: parsed.data, version: 1 }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Dashboard layout could not be saved." }, { status: 500 });
  return NextResponse.json(parsed.data);
}
