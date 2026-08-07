import type { Metadata } from "next";
import { Activity, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { getDataMode, hasSupabaseConfig } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  const demoMode = getDataMode() === "demo";
  const configured = hasSupabaseConfig();

  return (
    <main className="auth-page" id="main-page-content">
      <section className="auth-intro">
        <Link className="brand brand--auth" href="/" aria-label="Soma home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>Soma</span>
        </Link>
        <div className="auth-intro__copy">
          <span className="eyebrow">Your health, made understandable</span>
          <h1>See the signal.<br />Skip the searching.</h1>
          <p>Soma brings sleep, recovery, activity, and coaching into one calm daily view.</p>
        </div>
        <div className="auth-principles">
          <span><Activity size={18} /> Personal baselines, not generic judgment</span>
          <span><Sparkles size={18} /> AI explanations grounded in your metrics</span>
          <span><LockKeyhole size={18} /> Private by default, with explicit consent</span>
        </div>
      </section>
      <section className="auth-card-wrap">
        <div className="auth-card">
          <span className="eyebrow">Welcome to Soma</span>
          <h2>Sign in to continue</h2>
          <p>Use the Google account that will authorize your Google Health data.</p>
          {configured && !demoMode ? (
            <GoogleSignInButton />
          ) : (
            <>
              <Link className="google-button" href="/onboarding"><Sparkles size={19} /> Continue in demo mode</Link>
              <p className="configuration-note">Google sign-in activates when Supabase keys and live mode are configured.</p>
            </>
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
