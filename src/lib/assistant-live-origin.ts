import { isLocalPreviewMode } from "@/lib/env";

const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseOrigin(value: string | null) {
  if (!value || value.includes(",")) return null;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function parseHostOrigin(host: string | null, protocol: string) {
  if (!host || /[\s,/@?#]/.test(host)) return null;
  return parseOrigin(`${protocol}//${host}`);
}

function isLocalhost(url: URL) {
  return localHostnames.has(url.hostname.toLowerCase());
}

function configuredOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) return null;

  try {
    const url = new URL(configured);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Checks browser Origin against the canonical site or the request authority.
 * Local preview may sit behind a loopback port proxy, so its Host / forwarded
 * host is also accepted when every authority is explicitly loopback-only.
 */
export function isAssistantLiveOriginAllowed(request: Request) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    return request.headers.get("sec-fetch-site")?.toLowerCase() === "same-origin";
  }

  const origin = parseOrigin(originHeader);
  if (!origin) return false;

  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }

  if (origin.origin === requestUrl.origin || origin.origin === configuredOrigin()) return true;

  if (!isLocalPreviewMode() || !isLocalhost(origin) || !isLocalhost(requestUrl)) return false;

  // The request Host header is the authority presented to Next by the local
  // proxy. Accept only loopback names; arbitrary Host values never extend the
  // trusted origin set.
  const hostOrigin = parseHostOrigin(request.headers.get("host"), origin.protocol);
  if (hostOrigin?.origin === origin.origin && isLocalhost(hostOrigin)) return true;

  // Some local proxies preserve their internal Host and send the public
  // authority separately. Trust this only in local preview, only for loopback
  // endpoints, and only when the proxy supplies one unambiguous protocol.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProtocolHeader = request.headers.get("x-forwarded-proto");
  if (!forwardedHost || forwardedHost.includes(",")) return false;
  const requestHost = request.headers.get("host");
  const parsedRequestHost = parseHostOrigin(requestHost, requestUrl.protocol);
  if (!parsedRequestHost || !isLocalhost(parsedRequestHost)) return false;

  const forwardedProtocol = forwardedProtocolHeader?.toLowerCase() ?? requestUrl.protocol.slice(0, -1);
  if ((forwardedProtocolHeader?.includes(",") ?? false) || !["http", "https"].includes(forwardedProtocol)) return false;
  if (`${forwardedProtocol}:` !== origin.protocol) return false;

  const forwardedOrigin = parseHostOrigin(forwardedHost, `${forwardedProtocol}:`);
  return Boolean(forwardedOrigin && forwardedOrigin.origin === origin.origin && isLocalhost(forwardedOrigin));
}
