import { redirect } from "next/navigation";

import { hasSupabaseConfig, isLocalPreviewMode } from "@/lib/env";
import { previewUser } from "@/lib/local-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SomaUser = {
  id: string;
  email: string | null;
  displayName: string;
};

export async function getCurrentUser(): Promise<SomaUser | null> {
  if (isLocalPreviewMode()) return previewUser;
  if (!hasSupabaseConfig()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    displayName:
      data.user.user_metadata.full_name ??
      data.user.user_metadata.name ??
      data.user.email?.split("@")[0] ??
      "Soma user",
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
