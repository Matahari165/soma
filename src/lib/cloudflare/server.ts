import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

export async function createCloudflareServerClient() {
  return createCloudflareAdminClient();
}
