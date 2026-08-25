import { NextResponse } from "next/server";

import { deleteCurrentSession } from "@/lib/cloudflare/session";
import { isLocalPreviewMode } from "@/lib/env";

export async function POST() {
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  await deleteCurrentSession();
  return NextResponse.json({ ok: true });
}
