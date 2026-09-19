import { NextResponse } from "next/server";

import { GET as getWebMeals, POST as postWebMeal } from "@/app/api/meals/route";
import { getBearerSessionUser } from "@/lib/cloudflare/session";

async function isAuthenticated() {
  return Boolean(await getBearerSessionUser());
}

export async function GET(request: Request) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return getWebMeals(request);
}

export async function POST(request: Request) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return postWebMeal(request);
}
