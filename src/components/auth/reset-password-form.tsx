"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { recoveryTokenFromRedirect } from "@/lib/recovery-link";

export function ResetPasswordForm() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectAddress, setRedirectAddress] = useState("");

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("access_token");
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    queueMicrotask(() => {
      setAccessToken(token);
      setReady(true);
    });
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password-recovery/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "This recovery link could not be used.");
        return;
      }
      setAccessToken(null);
      setPassword("");
      setConfirmation("");
      setCompleted(true);
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function useLocalRedirect(event: React.FormEvent) {
    event.preventDefault();
    const token = recoveryTokenFromRedirect(redirectAddress, window.location.origin);
    if (!token) {
      setError("This address has no usable recovery session. Open the newest email link, then copy the full address shown in the browser.");
      return;
    }
    setAccessToken(token);
    setRedirectAddress("");
    setError(null);
  }

  if (completed) return (
    <div className="auth-credentials">
      <p className="auth-success-banner soma-motion-state" role="status"><CheckCircle2 size={16} aria-hidden="true" />Password updated. Sign in with your new password.</p>
      <Link className="auth-text-action" href="/login">Back to sign in</Link>
    </div>
  );

  if (ready && !accessToken) return (
    <div className="auth-credentials">
      <p className="auth-recovery-copy">Did the email link open a local address? Copy the full address shown after opening it and paste it here. Keep the link private.</p>
      <form className="auth-credentials-form" onSubmit={useLocalRedirect}>
        <div className="field">
          <label htmlFor="reset-redirect-address">Address shown after opening the email link</label>
          <input id="reset-redirect-address" type="password" autoComplete="off" required value={redirectAddress} onChange={(event) => setRedirectAddress(event.target.value)} />
        </div>
        {error && <p className="form-error auth-error soma-motion-state" role="alert">{error}</p>}
        <button type="submit" className="button button--primary auth-submit-btn">Continue</button>
      </form>
      <Link className="auth-text-action" href="/login">Back to sign in</Link>
    </div>
  );

  return (
    <div className="auth-credentials">
      <form className="auth-credentials-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="reset-password">New password</label>
          <input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={!ready || loading} />
        </div>
        <div className="field">
          <label htmlFor="reset-confirmation">Confirm new password</label>
          <input id="reset-confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={!ready || loading} />
        </div>
        {error && <p className="form-error auth-error soma-motion-state" role="alert">{error}</p>}
        <button type="submit" className="button button--primary auth-submit-btn" disabled={!ready || loading}>
          {loading ? <span className="auth-loading-spinner"><Loader2 className="spin" size={16} aria-hidden="true" />Updating password…</span> : "Set new password"}
        </button>
      </form>
    </div>
  );
}
