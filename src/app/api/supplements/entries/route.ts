import { NextResponse } from "next/server";

import { supplementEntryInputSchema, supplementEntryToView } from "@/domain/supplements";
import { getCurrentUser } from "@/lib/auth";
import { createSupplementEntry, listSupplementEntries, SupplementServiceError } from "@/services/supplements";

const noStore = { "Cache-Control": "private, no-store" };

function serviceError(error: unknown) {
  if (!(error instanceof SupplementServiceError)) return NextResponse.json({ error: "Les prises de compléments sont momentanément indisponibles." }, { status: 500, headers: noStore });
  return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "invalid" ? 400 : error.code === "not_found" ? 404 : 503, headers: noStore });
}
function options(request: Request) {
  const url = new URL(request.url);
  return { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined, definitionId: url.searchParams.get("definitionId") ?? undefined };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  try {
    return NextResponse.json({ entries: (await listSupplementEntries(user.id, options(request))).map(supplementEntryToView) }, { headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = supplementEntryInputSchema.safeParse(body?.entry ?? body);
  if (!parsed.success) return NextResponse.json({ error: "La prise du complément est invalide." }, { status: 400, headers: noStore });
  try {
    return NextResponse.json({ entry: supplementEntryToView(await createSupplementEntry(user.id, parsed.data)) }, { status: 201, headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}
