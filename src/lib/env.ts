export type DataMode = "demo" | "live";

export function getDataMode(): DataMode {
  return process.env.NEXT_PUBLIC_SOMA_DATA_MODE === "live" ? "live" : "demo";
}

export function isLiveMode() {
  return getDataMode() === "live";
}

export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function requireServerEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
