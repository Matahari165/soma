/** Supabase's implicit email redirect carries the short-lived session in the URL fragment. */
export function recoveryTokenFromRedirect(address: string, siteOrigin: string): string | null {
  try {
    const url = new URL(address.trim());
    const local = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (!local && url.origin !== siteOrigin) return null;
    const token = new URLSearchParams(url.hash.slice(1)).get("access_token");
    return token && token.length <= 4096 ? token : null;
  } catch {
    return null;
  }
}
