import { NextResponse } from "next/server";

import { GET as getWebAnalysis, POST as postWebAnalysis } from "@/app/api/meals/[id]/analyze/route";
import { getBearerSessionUser } from "@/lib/cloudflare/session";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

async function isAuthenticated() {
  return Boolean(await getBearerSessionUser());
}

export async function GET(request: Request, context: RouteContext) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return getWebAnalysis(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return postWebAnalysis(request, context);
}
