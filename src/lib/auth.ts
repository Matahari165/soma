import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/cloudflare/session";
import { hasCloudflareConfig, isLocalPreviewMode } from "@/lib/env";
import { previewUser } from "@/lib/local-preview";

export type SomaUser = {
  id: string;
  email: string | null;
  displayName: string;
};

export async function getCurrentUser(): Promise<SomaUser | null> {
  if (isLocalPreviewMode()) return previewUser;
  if (!hasCloudflareConfig()) {
    return null;
  }
  return getSessionUser();
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
