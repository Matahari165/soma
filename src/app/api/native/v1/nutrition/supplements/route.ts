import { NextResponse } from "next/server";

import { supplementDefinitionInputSchema, supplementDefinitionToView } from "@/domain/supplements";
import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { createSupplementDefinition, listSupplementDefinitions, SupplementServiceError } from "@/services/supplements";

const noStore = { "Cache-Control": "private, no-store" };

function serviceError(error: unknown) {
  if (!(error instanceof SupplementServiceError)) {
    return NextResponse.json({ error: "Les définitions de compléments sont momentanément indisponibles." }, { status: 500, headers: noStore });
  }
  const status = error.code === "invalid" ? 400 : error.code === "not_found" ? 404 : 503;
  return NextResponse.json({ error: error.message, code: error.code }, { status, headers: noStore });
}

export async function GET() {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  try {
    return NextResponse.json({ definitions: (await listSupplementDefinitions(user.id)).map(supplementDefinitionToView) }, { headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}

export async function POST(request: Request) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = supplementDefinitionInputSchema.safeParse(body?.definition ?? body);
  if (!parsed.success) return NextResponse.json({ error: "La définition du complément est invalide." }, { status: 400, headers: noStore });
  try {
    const definition = await createSupplementDefinition(user.id, parsed.data);
    return NextResponse.json({ definition: supplementDefinitionToView(definition) }, { status: 201, headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}
