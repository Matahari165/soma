import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ confirmation: z.literal("DELETE MY SOMA DATA") });

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the exact confirmation phrase." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  await admin.from("audit_events").insert({ user_id: user.id, event_type: "account_deletion_requested", resource_type: "account" });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "Account deletion could not be completed." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
