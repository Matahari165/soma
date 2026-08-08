import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLocalPreviewMode } from "@/lib/env";

export async function POST() {
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
