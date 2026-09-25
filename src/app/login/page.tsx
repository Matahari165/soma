import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: { absolute: "Sign in — Soma" } };

const authErrors: Record<string, string> = {
  configuration: "Authentication is not configured in this environment.",
  auth_service: "Google authentication is temporarily unavailable. Please try again in a moment.",
  oauth_start: "Google sign-in could not be started. Please try again.",
  missing_code: "No authorization code returned from Google. Please try again.",
  oauth_callback: "Google sign-in could not be completed. Please try again.",
  oauth_state: "The sign-in session expired. Please try again.",
  oauth_profile: "Could not retrieve your Google profile. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; deleted?: string; reset?: string }>;
}) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  const reset = params.reset === "1";
  if (user && !reset) redirect("/");
  const errorCode = params.error;
  const errorMessage = errorCode ? authErrors[errorCode] ?? "Authentication failed. Please try again." : null;
  const nextParam = typeof params.next === "string" ? params.next : null;
  const nextPath =
    nextParam &&
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//") &&
    nextParam.length <= 200 &&
    !nextParam.includes("\\") &&
    !/\s/.test(nextParam) &&
    !nextParam.includes("@") &&
    !nextParam.includes(":")
      ? nextParam
      : null;
  const deleted = params.deleted === "1";

  return <PublicHome next={nextPath} errorMessage={errorMessage} deleted={deleted} reset={reset} />;
}
