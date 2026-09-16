import Link from "next/link";

import { CredentialsForm } from "@/components/auth/credentials-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { SomaLogo } from "@/components/soma-logo";
import { hasCloudflareConfig } from "@/lib/env";

export function PublicHome({
  next,
  errorMessage,
  deleted,
}: {
  next?: string | null;
  errorMessage?: string | null;
  deleted?: boolean;
} = {}) {
  const configured = hasCloudflareConfig();

  return (
    <main className="auth-page" id="main-page-content">
      <section className="auth-intro" aria-labelledby="auth-intro-title">
        <Link className="brand brand--auth" href="/" aria-label="Soma Home">
          <SomaLogo />
        </Link>
        <div className="auth-intro__copy">
          <h1 id="auth-intro-title">
            Lisez votre<br />
            <em>propre rythme.</em>
          </h1>
          <p>Sommeil, récupération, mouvement et entraînement — mesurés par rapport à vous.</p>
        </div>
      </section>
      <section className="auth-card-wrap" aria-labelledby="auth-title">
        <div className="auth-card">
          <h2 id="auth-title">Welcome</h2>
          <p className="auth-card__subtitle">Sign in or create your personal account to begin.</p>
          {deleted && (
            <p className="configuration-note" role="status">
              Your account and Soma data have been permanently deleted.
            </p>
          )}

          {/* Email & Password Authentication */}
          <CredentialsForm next={next} />

          {/* Optional Google Sign-In */}
          <div className="auth-separator" aria-hidden="true">
            <span>or</span>
          </div>

          {configured ? (
            <GoogleSignInButton next={next} />
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
