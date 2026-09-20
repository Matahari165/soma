import { NextResponse, type NextRequest } from "next/server";

import { MAX_MEAL_MULTIPART_BYTES } from "@/domain/meals";
import { isLocalPreviewMode } from "@/lib/env";

const publicMachinePaths = [
  "/api/health/webhook",
  "/api/cron/meal-analysis",
  "/api/cron/sync",
  "/api/cron/archive-health",
];

const publicPaths = [
  "/login",
  "/auth/google",
  "/auth/callback",
  "/api/health/google/callback",
  ...publicMachinePaths,
  "/privacy",
  "/terms",
];

const publicAuthPaths = ["/api/auth/register", "/api/auth/login"];
const nativeAuthPrefix = "/api/native/v1/auth/";
const nativeGoogleBridgePath = "/api/native/v2/auth/bridge";

export function requestBodyLimitForPath(pathname: string) {
  return (/^\/api\/meals\/[^/]+\/photos$/.test(pathname) || pathname === "/api/meals/analyze")
    ? MAX_MEAL_MULTIPART_BYTES
    : 64 * 1024;
}

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const development = process.env.NODE_ENV !== "production";
  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval' http://localhost:8400" : " 'strict-dynamic'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://openidconnect.googleapis.com https://www.googleapis.com${development ? " http://localhost:8400" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  const createResponse = () => NextResponse.next({ request: { headers: requestHeaders } });
  const secureResponse = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", contentSecurityPolicy);
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    if (!request.nextUrl.pathname.startsWith("/privacy") && !request.nextUrl.pathname.startsWith("/terms")) response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const publicMachineRoute = publicMachinePaths.some((path) => request.nextUrl.pathname.startsWith(path));
  const publicNativeAuthRoute = request.nextUrl.pathname.startsWith(nativeAuthPrefix)
    || request.nextUrl.pathname === nativeGoogleBridgePath;
  const bearerRequest = /^Bearer [A-Za-z0-9_-]{32,}$/.test(request.headers.get("authorization") ?? "");
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (unsafeMethod) {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    const requestLimit = requestBodyLimitForPath(request.nextUrl.pathname);
    if (contentLength > requestLimit) return secureResponse(NextResponse.json({ error: "Request is too large." }, { status: 413 }));
  }
  if (unsafeMethod && !publicMachineRoute && !publicNativeAuthRoute && !bearerRequest) {
    const origin = request.headers.get("origin");
    const requestHost = request.headers.get("host");
    const allowedOrigins = new Set([request.nextUrl.origin, new URL(request.url).origin, new URL(process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin).origin]);
    const parsedOrigin = origin ? new URL(origin) : null;
    const sameRequestHost = Boolean(parsedOrigin && requestHost && parsedOrigin.host === requestHost && ["http:", "https:"].includes(parsedOrigin.protocol));
    if (!origin || (!allowedOrigins.has(origin) && !sameRequestHost)) return secureResponse(NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 }));
  }

  const response = createResponse();
  const isPublicPath = request.nextUrl.pathname === "/"
    || publicPaths.some((path) => request.nextUrl.pathname.startsWith(path))
    || publicAuthPaths.includes(request.nextUrl.pathname)
    || publicNativeAuthRoute;

  if (isLocalPreviewMode()) {
    if (request.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
    return secureResponse(response);
  }

  if (!process.env.NEXT_PUBLIC_SITE_URL) {
    if (isPublicPath) return secureResponse(response);
    return NextResponse.redirect(new URL("/login?error=configuration", request.url));
  }

  const hasSessionCredential = Boolean(request.cookies.get("soma_session")?.value) || bearerRequest;
  if (!hasSessionCredential && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return secureResponse(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

export const runtime = "experimental-edge";
