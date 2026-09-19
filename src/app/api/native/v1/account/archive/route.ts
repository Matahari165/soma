import { NextResponse } from "next/server";

import { GET as getWebArchive } from "@/app/api/account/archive/route";
import { getBearerSessionUser } from "@/lib/cloudflare/session";

export async function GET(request: Request) {
  if (!await getBearerSessionUser()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return getWebArchive(request);
}
