import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function loginError(origin: string, code: "auth_service" | "oauth_start") {
  return NextResponse.redirect(new URL(`/login?error=${code}`, origin));
}

function safeGoogleRedirect(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "accounts.google.com" ? url : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: "openid email profile",
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) return loginError(origin, "oauth_start");

  try {
    const upstream = await fetch(data.url, {
      cache: "no-store",
      redirect: "manual",
      headers: { Accept: "application/json" },
    });
    const location = upstream.headers.get("location");
    const json = location || !upstream.ok ? null : await upstream.json().catch(() => null) as { url?: unknown } | null;
    const destination = safeGoogleRedirect(location ?? json?.url);
    if (!destination) return loginError(origin, "auth_service");
    return NextResponse.redirect(destination);
  } catch {
    return loginError(origin, "auth_service");
  }
}
