import { NextResponse } from "next/server";
import { z } from "zod";

import { metricRoles } from "@/domain/lab/metrics";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  metricId: z.string().regex(/^[a-z0-9_:-]{1,100}$/),
  role: z.enum(metricRoles),
});

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid metric preference." }, { status: 400 });
  }
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("lab_metric_preferences").upsert({
    user_id: user.id,
    metric_id: parsed.data.metricId,
    role: parsed.data.role,
  }, { onConflict: "user_id,metric_id" });
  if (error) return NextResponse.json({ error: "This metric preference could not be saved." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
