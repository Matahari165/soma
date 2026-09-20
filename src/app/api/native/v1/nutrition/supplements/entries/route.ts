import { NextResponse } from "next/server";

import { supplementEntryInputSchema, supplementEntryToView } from "@/domain/supplements";
import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { listSupplementEntries, SupplementServiceError, upsertSupplementEntry } from "@/services/supplements";

const noStore = { "Cache-Control": "private, no-store" };

function serviceError(error: unknown) {
  if (!(error instanceof SupplementServiceError)) {
    return NextResponse.json({ error: "Les prises de compléments sont momentanément indisponibles." }, { status: 500, headers: noStore });
  }
  const status = error.code === "invalid" ? 400 : error.code === "not_found" ? 404 : 503;
  return NextResponse.json({ error: error.message, code: error.code }, { status, headers: noStore });
}

export async function GET(request: Request) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const url = new URL(request.url);
  try {
    const entries = await listSupplementEntries(user.id, {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      definitionId: url.searchParams.get("definitionId") ?? undefined,
    });
    return NextResponse.json({ entries: entries.map(supplementEntryToView) }, { headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}

export async function POST(request: Request) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = supplementEntryInputSchema.safeParse(body?.entry ?? body);
  if (!parsed.success) return NextResponse.json({ error: "La prise du complément est invalide." }, { status: 400, headers: noStore });
  try {
    const result = await upsertSupplementEntry(user.id, parsed.data);
    return NextResponse.json({ entry: supplementEntryToView(result.entry) }, { status: result.created ? 201 : 200, headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}
