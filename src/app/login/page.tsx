import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { SomaLogo } from "@/components/soma-logo";
import { getCurrentUser } from "@/lib/auth";
import { hasCloudflareConfig } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

const authErrors: Record<string, string> = {
  auth_service: "Google sign-in is temporarily unavailable. Try again in a moment.",
  oauth_start: "Google sign-in could not start. Try again.",
  missing_code: "Google did not return a sign-in code. Try again.",
  oauth_callback: "Google sign-in could not be completed. Try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (user) redirect("/");
  const configured = hasCloudflareConfig();
  const errorCode = params.error;
  const errorMessage = errorCode ? authErrors[errorCode] ?? "Google sign-in could not be completed." : null;

  return (
    <main className="auth-page" id="main-page-content">
      <section className="auth-intro">
        <Link className="brand brand--auth" href="/" aria-label="Soma home">
          <SomaLogo />
        </Link>
        <div className="auth-intro__copy">
          <h1>Welcome<br /> <em>back.</em></h1>
        </div>
      </section>
      <section className="auth-card-wrap">
        <div className="auth-card">
          <h2>Sign in to continue</h2>
          <p>Use the account linked to your data.</p>
          {configured ? (
            <GoogleSignInButton />
          ) : (
            <p className="configuration-note" role="alert">Google sign-in is not configured yet.</p>
          )}
          {errorMessage && <p className="form-error auth-error" role="alert">{errorMessage}</p>}
          <div className="auth-consent-note">
            Health access is requested separately and can be removed at any time.
          </div>
          <p className="legal-copy">By continuing, you agree to the <Link href="/terms">Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.</p>
        </div>
      </section>
    </main>
  );
}
