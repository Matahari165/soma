import { NextResponse } from "next/server";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { createPersonalLabStream } from "@/services/personal-lab";

const overviewProvenance = {
  sleep: { kind: "health_source", label: "Sources santé importées" },
  sleepRegularity: { kind: "health_source", label: "Sources santé importées" },
  recovery: { kind: "soma_calculation", label: "Calcul Soma" },
  effort: { kind: "soma_calculation", label: "Calcul Soma" },
  calories: { kind: "soma_meals", label: "Repas confirmés" },
  calorieTarget: { kind: "soma_calculation", label: "Cible nutritionnelle Soma" },
  averages: { kind: "soma_calculation", label: "Moyennes Soma" },
} as const;
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });

  try {
    const overview = await createPersonalLabStream(user, { includeAnalysis: false }).overview;
    return NextResponse.json({
      ...overview,
      today: {
        ...overview.today,
        provenance: overviewProvenance,
      },
    }, {
      headers: noStore,
    });
  } catch {
    return NextResponse.json({ error: "The Personal Lab overview could not be loaded." }, { status: 500, headers: noStore });
  }
}
