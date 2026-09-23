import { NextResponse } from "next/server";

import { requireServerEnv } from "@/lib/env";
import { reconcileAccountDeletionJobs } from "@/services/account-deletion";

export const maxDuration = 50;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${requireServerEnv("CRON_SECRET")}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json({ completed: await reconcileAccountDeletionJobs() });
  } catch {
    return NextResponse.json({ error: "Account cleanup could not be completed." }, { status: 500 });
  }
}
