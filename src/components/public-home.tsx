import Link from "next/link";

import { CredentialsForm } from "@/components/auth/credentials-form";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { SomaLogo } from "@/components/soma-logo";
import { hasCloudflareConfig } from "@/lib/env";

export function PublicHome({
  next,
  errorMessage,
  deleted,
  reset,
}: {
  next?: string | null;
  errorMessage?: string | null;
  deleted?: boolean;
  reset?: boolean;
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
            Read your<br />
            <em>own rhythm.</em>
          </h1>
          <p>Sleep, recovery, movement, and training — measured against you.</p>
        </div>
      </section>
      <section className="auth-card-wrap" aria-labelledby="auth-title">
        <div className="auth-card">
          <h2 id="auth-title">{reset ? "Set a new password" : "Welcome"}</h2>
          <p className="auth-card__subtitle">{reset ? "Choose a password for your Soma account." : "Sign in or create your personal account to begin."}</p>
          {deleted && (
            <p className="configuration-note" role="status">
              Your account and Soma data have been permanently deleted.
            </p>
          )}

          {/* Email & Password Authentication */}
          {reset ? <ResetPasswordForm /> : <CredentialsForm next={next} />}

          {/* Optional Google Sign-In */}
          {!reset && <div className="auth-separator" aria-hidden="true">
            <span>or</span>
          </div>}

          {!reset && (configured ? (
            <GoogleSignInButton next={next} />
          ) : (
            <p className="configuration-note" role="alert">
              Google OAuth is not configured in this environment.
            </p>
          ))}

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
