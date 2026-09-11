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

/** Enables the production Observatoire shell while keeping production data-backed. */
export function isObservatoryMode() {
  if (isLocalPreviewMode()) return true;
  if (process.env.SOMA_OBSERVATORY_MODE === "true") return true;
  if (process.env.NODE_ENV !== "production") return false;

  try {
    return (getCloudflareContext().env as CloudflareRuntimeEnv).SOMA_OBSERVATORY_MODE === "true";
  } catch {
    return false;
  }
}

export function requireServerEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export function getSiteUrl() {
  return (getCloudflareSiteUrl() ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
