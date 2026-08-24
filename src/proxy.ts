import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isLocalPreviewMode } from "@/lib/env";

const publicMachinePaths = [
  "/api/health/webhook",
  "/api/cron/sync",
  "/api/cron/archive-health",
];

const publicPaths = [
  "/login",
  "/auth/callback",
  "/api/health/google/callback",
  ...publicMachinePaths,
  "/privacy",
  "/terms",
];

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const development = process.env.NODE_ENV !== "production";
  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co",
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
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (unsafeMethod && !publicMachineRoute) {
    const origin = request.headers.get("origin");
    const requestHost = request.headers.get("host");
    const allowedOrigins = new Set([request.nextUrl.origin, new URL(request.url).origin, new URL(process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin).origin]);
    const parsedOrigin = origin ? new URL(origin) : null;
    const sameRequestHost = Boolean(parsedOrigin && requestHost && parsedOrigin.host === requestHost && ["http:", "https:"].includes(parsedOrigin.protocol));
    if (!origin || (!allowedOrigins.has(origin) && !sameRequestHost)) return secureResponse(NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 }));
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 64 * 1024) return secureResponse(NextResponse.json({ error: "Request is too large." }, { status: 413 }));
  }

  let response = createResponse();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isPublicPath = request.nextUrl.pathname === "/" || publicPaths.some((path) => request.nextUrl.pathname.startsWith(path));

  if (isLocalPreviewMode()) {
    if (request.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
    return secureResponse(response);
  }

  if (!url || !anonKey) {
    if (isPublicPath) return secureResponse(response);
    return NextResponse.redirect(new URL("/login?error=configuration", request.url));
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = createResponse();
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (data.user && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return secureResponse(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
