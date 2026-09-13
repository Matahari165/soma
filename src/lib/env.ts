import { getCloudflareContext } from "@opennextjs/cloudflare";

type CloudflareRuntimeEnv = { NEXT_PUBLIC_SITE_URL?: unknown; SOMA_OBSERVATORY_MODE?: unknown };

function getCloudflareSiteUrl() {
  if (process.env.NODE_ENV !== "production") return undefined;

  try {
    const value = (getCloudflareContext().env as CloudflareRuntimeEnv).NEXT_PUBLIC_SITE_URL;
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined;
  }
}

export function hasCloudflareConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SITE_URL ?? getCloudflareSiteUrl());
}

export function isLocalPreviewMode() {
  return process.env.NODE_ENV !== "production" && process.env.SOMA_LOCAL_PREVIEW === "true";
}

/** Soma now has one visual world: the data-backed dark Observatoire shell. */
export function isObservatoryMode() {
  return true;
}

export function requireServerEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? getCloudflareSiteUrl() ?? "http://localhost:3000").replace(/\/$/, "");
}
