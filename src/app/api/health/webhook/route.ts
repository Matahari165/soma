import { NextResponse } from "next/server";
import { z } from "zod";

import { stableHash } from "@/lib/crypto";
import { requireServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isGoogleHealthDataType } from "@/integrations/google-health/client";
import { verifyGoogleHealthWebhookSignature } from "@/integrations/google-health/webhook-signature";

const notificationSchema = z.object({
  type: z.string().max(100).optional(),
  data: z.object({
    healthUserId: z.string().max(256).optional(),
    dataType: z.string().max(256).refine(isGoogleHealthDataType, "Unknown Google Health data type.").optional(),
    operation: z.enum(["UPSERT", "DELETE"]).optional(),
    clientProvidedSubscriptionName: z.string().max(256).optional(),
    intervals: z.array(z.unknown()).max(1000).optional(),
  }).passthrough().optional(),
}).passthrough();

type Notification = z.infer<typeof notificationSchema>;
const payloadSchema = z.union([notificationSchema, z.array(notificationSchema).max(100)]);

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 256 * 1024) return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "Webhook payload must be JSON." }, { status: 415 });
  const expected = requireServerEnv("GOOGLE_HEALTH_WEBHOOK_SECRET");
  if (request.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 256 * 1024) return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  let body: unknown = null;
  try { body = JSON.parse(rawBody || "null"); } catch { return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 }); }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  const notifications: Notification[] = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  if (notifications.every((notification) => notification.type === "verification")) {
    return NextResponse.json({ verified: true }, { status: 201 });
  }
  if (notifications.some((notification) => !notification.data?.healthUserId || !notification.data.dataType)) {
    return NextResponse.json({ error: "Webhook notification is missing its user or data type." }, { status: 400 });
  }
  if (!(await verifyGoogleHealthWebhookSignature(rawBody, request.headers.get("google-health-api-signature")))) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const rows = notifications.filter((notification) => notification.data?.healthUserId).map((notification) => ({
    deduplication_key: stableHash(JSON.stringify(notification)),
    health_user_id: notification.data?.healthUserId,
    data_type: notification.data?.dataType,
    operation: notification.data?.operation,
    payload: notification,
    status: "queued",
  }));
  if (rows.length) {
    const { error } = await admin.from("webhook_events").upsert(rows, { onConflict: "deduplication_key", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: "Webhook could not be queued." }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
