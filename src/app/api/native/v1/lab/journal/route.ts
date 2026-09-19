import { NextResponse } from "next/server";

import { saveJournalEntriesSchema } from "@/domain/lab/journal";
import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { getNativeLabDay, saveNativeJournalEntries } from "@/services/native-lab";

export async function PUT(request: Request) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = saveJournalEntriesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the journal values." }, { status: 400 });

  try {
    const saved = await saveNativeJournalEntries(user.id, parsed.data);
    const day = await getNativeLabDay(user.id, parsed.data.entryDate);
    return NextResponse.json({ ok: true, ...saved, day }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The journal could not be saved.";
    const inputMessages = new Set([
      "Journal drafts are available for today and the previous four days.",
      "One journal variable is unavailable.",
      "One journal value is invalid.",
      "Automatic journal variables cannot be written through this route.",
    ]);
    if (inputMessages.has(message)) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: "The journal could not be saved." }, { status: 500 });
  }
}
