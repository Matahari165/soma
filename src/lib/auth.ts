import { redirect } from "next/navigation";

import { getDataMode, hasSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SomaUser = {
  id: string;
  email: string | null;
  displayName: string;
  isDemo: boolean;
};

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

export async function getCurrentUser(): Promise<SomaUser | null> {
  if (getDataMode() === "demo") {
    return {
      id: DEMO_USER_ID,
      email: "demo@soma.local",
      displayName: "Jeremy",
      isDemo: true,
    };
  }

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
    isDemo: false,
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
