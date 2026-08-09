import type { Metadata } from "next";
import Link from "next/link";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { SomaLogo } from "@/components/soma-logo";
import { hasSupabaseConfig } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  const configured = hasSupabaseConfig();

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
            <p className="configuration-note" role="alert">Google sign-in is not configured. Add the Supabase project values before using Soma.</p>
          )}
          <div className="auth-consent-note">
            Health access is requested separately and can be removed at any time.
          </div>
          <p className="legal-copy">By continuing, you agree to the <Link href="/terms">Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.</p>
        </div>
      </section>
    </main>
  );
}
