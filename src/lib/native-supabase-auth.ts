import "server-only";

const AUTH_TIMEOUT_MS = 8_000;

type SupabaseIdentity = {
  id?: unknown;
  provider_id?: unknown;
  provider?: unknown;
  identity_data?: { sub?: unknown; email?: unknown; name?: unknown; full_name?: unknown; avatar_url?: unknown; picture?: unknown } | null;
};

type SupabaseAuthUser = {
  id?: unknown;
  email?: unknown;
  user_metadata?: { name?: unknown; full_name?: unknown; avatar_url?: unknown; picture?: unknown } | null;
  identities?: SupabaseIdentity[] | null;
};

export type VerifiedNativeGoogleIdentity = {
  authUserId: string;
  googleSubject: string;
  email?: string;
  name?: string;
  picture?: string;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseVerifiedGoogleIdentity(user: SupabaseAuthUser): VerifiedNativeGoogleIdentity | null {
  const authUserId = stringValue(user.id);
  if (!authUserId) return null;
  const googleIdentity = user.identities?.find((identity) => identity.provider === "google");
  if (!googleIdentity) return null;
  const identityData = googleIdentity.identity_data ?? {};
  const googleSubject = stringValue(identityData.sub) ?? stringValue(googleIdentity.provider_id);
  if (!googleSubject) return null;
  const metadata = user.user_metadata ?? {};
  return {
    authUserId,
    googleSubject,
    email: stringValue(identityData.email) ?? stringValue(user.email),
    name: stringValue(identityData.name) ?? stringValue(identityData.full_name) ?? stringValue(metadata.name) ?? stringValue(metadata.full_name),
    picture: stringValue(identityData.picture) ?? stringValue(identityData.avatar_url) ?? stringValue(metadata.picture) ?? stringValue(metadata.avatar_url),
  };
}

export async function verifySupabaseGoogleAccessToken(accessToken: string): Promise<VerifiedNativeGoogleIdentity | null> {
  const supabaseURL = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseURL || !serviceRoleKey) throw new Error("Supabase Auth is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${supabaseURL}/auth/v1/user`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return parseVerifiedGoogleIdentity(await response.json() as SupabaseAuthUser);
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveSomaUserForGoogleIdentity(identity: VerifiedNativeGoogleIdentity) {
  const supabaseURL = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseURL || !serviceRoleKey) throw new Error("Supabase Auth is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${supabaseURL}/rest/v1/rpc/link_native_google_identity`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_auth_user_id: identity.authUserId,
        p_google_subject: identity.googleSubject,
        p_email: identity.email ?? null,
        p_display_name: identity.name ?? null,
        p_avatar_url: identity.picture ?? null,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Native identity link failed (${response.status}).`);
    const somaUserId: unknown = await response.json();
    if (typeof somaUserId !== "string" || !somaUserId) throw new Error("Native identity link returned no user.");
    return somaUserId;
  } finally {
    clearTimeout(timeout);
  }
}
