import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

const decisionSchema = z.object({ decision: z.enum(["confirm", "reject"]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ status: parsed.data.decision === "confirm" ? "executed in local preview" : "rejected" });
  const { id } = await context.params;
  const admin = createCloudflareAdminClient();
  if (parsed.data.decision === "reject") {
    const { data: rejected, error } = await admin.from("agent_action_proposals").update({ status: "rejected" }).eq("id", id).eq("user_id", user.id).eq("status", "proposed").select("id").maybeSingle();
    if (error) return NextResponse.json({ error: "The action could not be rejected." }, { status: 500 });
    if (!rejected) return NextResponse.json({ error: "This preview is no longer available." }, { status: 409 });
    return NextResponse.json({ status: "rejected" });
  }
  const { error } = await admin.rpc("execute_soma_proposal", { p_user_id: user.id, p_proposal_id: id });
  if (error) {
    const status = error.code === "P0002" ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? "This preview is no longer available." : "The confirmed action could not be completed." }, { status });
  }
  return NextResponse.json({ status: "executed" });
}
