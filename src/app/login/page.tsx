import type { Metadata } from "next";
import { Activity, BrainCircuit, LockKeyhole } from "lucide-react";
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
          <span className="eyebrow">Your health, made understandable</span>
          <h1>See the signal.<br />Skip the searching.</h1>
          <p>Soma brings sleep, recovery, activity, and coaching into one calm daily view.</p>
        </div>
        <div className="auth-principles">
          <span><Activity size={18} /> Personal baselines, not generic judgment</span>
          <span><BrainCircuit size={18} /> Explanations grounded in your metrics</span>
          <span><LockKeyhole size={18} /> Private by default, with explicit consent</span>
        </div>
      </section>
      <section className="auth-card-wrap">
        <div className="auth-card">
          <span className="eyebrow">Welcome to Soma</span>
          <h2>Sign in to continue</h2>
          <p>Use the Google account that will authorize your Google Health data.</p>
          {configured ? (
            <GoogleSignInButton />
          ) : (
            <p className="configuration-note" role="alert">Google sign-in is not configured. Add the Supabase project values before using Soma.</p>
          )}
          <div className="auth-consent-note">
            Google sign-in creates your Soma account. Google Health access is requested separately and can be disconnected at any time.
          </div>
          <p className="legal-copy">By continuing, you agree to the <Link href="/terms">Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.</p>
        </div>
      </section>
    </main>
  );
}
