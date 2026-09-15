import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CredentialsForm } from "@/components/auth/credentials-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { SomaLogo } from "@/components/soma-logo";
import { getCurrentUser } from "@/lib/auth";
import { hasCloudflareConfig } from "@/lib/env";

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
  searchParams: Promise<{ error?: string; next?: string; deleted?: string }>;
}) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (user) redirect("/");
  const configured = hasCloudflareConfig();
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

  return (
    <main className="auth-page" id="main-page-content">
      <section className="auth-intro" aria-labelledby="auth-intro-title">
        <Link className="brand brand--auth" href="/" aria-label="Soma Home">
          <SomaLogo />
        </Link>
        <div className="auth-intro__copy">
          <h1 id="auth-intro-title">
            Welcome to<br />
            <em>Soma.</em>
          </h1>
        </div>
      </section>
      <section className="auth-card-wrap" aria-labelledby="auth-title">
        <div className="auth-card">
          <h2 id="auth-title">Welcome</h2>
          <p>Sign in or create your personal account to begin.</p>
          {deleted && (
            <p className="configuration-note" role="status">
              Your account and Soma data have been permanently deleted.
            </p>
          )}

          {/* Email & Password Authentication */}
          <CredentialsForm next={nextPath} />

          {/* Optional Google Sign-In */}
          <div className="auth-separator" aria-hidden="true">
            <span>or</span>
          </div>

          {configured ? (
            <GoogleSignInButton next={nextPath} />
          ) : (
            <p className="configuration-note" role="alert">
              Google OAuth is not configured in this environment.
            </p>
          )}

          {errorMessage && (
            <p className="form-error auth-error" role="alert">
              {errorMessage}
            </p>
          )}
          <p className="legal-copy">
            By continuing, you agree to our <Link href="/terms">Terms of Service</Link> and acknowledge our <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
