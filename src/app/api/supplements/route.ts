import { NextResponse } from "next/server";

import { supplementDefinitionInputSchema, supplementDefinitionToView } from "@/domain/supplements";
import { getCurrentUser } from "@/lib/auth";
import { createSupplementDefinition, listSupplementDefinitions, SupplementServiceError } from "@/services/supplements";

const noStore = { "Cache-Control": "private, no-store" };

function serviceError(error: unknown) {
  if (!(error instanceof SupplementServiceError)) return NextResponse.json({ error: "Les compléments sont momentanément indisponibles." }, { status: 500, headers: noStore });
  return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "invalid" ? 400 : error.code === "not_found" ? 404 : 503, headers: noStore });
}
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  try {
    return NextResponse.json({ definitions: (await listSupplementDefinitions(user.id)).map(supplementDefinitionToView) }, { headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = supplementDefinitionInputSchema.safeParse(body?.definition ?? body);
  if (!parsed.success) return NextResponse.json({ error: "La définition du complément est invalide." }, { status: 400, headers: noStore });
  try {
    return NextResponse.json({ definition: supplementDefinitionToView(await createSupplementDefinition(user.id, parsed.data)) }, { status: 201, headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}
