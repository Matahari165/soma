export function hasCloudflareConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SITE_URL);
}

export function isLocalPreviewMode() {
  return process.env.NODE_ENV !== "production" && process.env.SOMA_LOCAL_PREVIEW === "true";
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
