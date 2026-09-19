import { NextResponse } from "next/server";

import { createJournalVariableSchema, updateJournalVariableSchema } from "@/domain/lab/journal";
import { isLocalPreviewMode } from "@/lib/env";
import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { createNativeJournalVariable, NativeJournalVariableError, updateNativeJournalVariable } from "@/services/native-lab";

export async function POST(request: Request) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = createJournalVariableSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check this variable." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  try {
    return NextResponse.json(await createNativeJournalVariable(user.id, parsed.data));
  } catch (error) {
    if (error instanceof NativeJournalVariableError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "This variable could not be created." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = updateJournalVariableSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check this variable." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  try {
    return NextResponse.json(await updateNativeJournalVariable(user.id, parsed.data));
  } catch (error) {
    if (error instanceof NativeJournalVariableError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "This variable could not be updated." }, { status: 500 });
  }
}
