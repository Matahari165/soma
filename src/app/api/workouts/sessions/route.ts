import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ programId: z.string().uuid(), name: z.string().min(1).max(120) });

export async function POST(request: Request) {
  if (isLocalPreviewMode()) return NextResponse.json({ id: crypto.randomUUID(), status: "active", preview: true }, { status: 201 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Session is invalid." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: id, error } = await admin.rpc("start_soma_workout_session", {
    p_user_id: user.id,
    p_program_id: parsed.data.programId,
    p_name: parsed.data.name,
  });
  if (error || !id) {
    const status = error?.code === "P0002" ? 404 : error?.code === "22023" ? 400 : 500;
    return NextResponse.json({ error: status === 404 ? "Program not found." : status === 400 ? "This program has no sets." : "Session could not be started." }, { status });
  }
  return NextResponse.json({ id, status: "active" }, { status: 201 });
}
