"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export function CredentialsForm({ next }: { next?: string | null }) {
  const [mode, setMode] = useState<"login" | "register" | "recover">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setRecoveryRequested(false);
    setLoading(true);

    const endpoint = mode === "login" ? "/api/auth/login" : mode === "register" ? "/api/auth/register" : "/api/auth/password-recovery/request";
    const payload = mode === "recover" ? { email } : mode === "login"
      ? { email, password }
      : { email, password, displayName: displayName.trim() || undefined };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || (mode === "login" ? "Invalid email or password." : mode === "register" ? "Failed to create account." : "Could not request a recovery link."));
        setLoading(false);
        return;
      }

      if (mode === "register") {
        setMode("login");
        setPassword("");
        setSuccessMessage("If this address is new, your account is ready. An existing account keeps its original password; use recovery if needed.");
        setLoading(false);
        return;
      }

      if (mode === "recover") {
        setMode("login");
        setPassword("");
        setSuccessMessage("If this address has a Soma password, check its inbox for a recovery link.");
        setRecoveryRequested(true);
        setLoading(false);
        return;
      }

      // Successful login: perform top-level navigation so the session cookie attaches synchronously
      const destination = next || (data.hasCompletedOnboarding ? "/" : "/onboarding");
      window.location.assign(destination);
    } catch {
      setError("A network error occurred. Please check your connection.");
      setLoading(false);
    }
  }

  return (
    <div className="auth-credentials">
      {mode === "recover" ? (
        <button type="button" className="auth-text-action auth-text-action--back" onClick={() => { setMode("login"); setError(null); setSuccessMessage(null); }}>
          Back to sign in
        </button>
      ) : <div className="auth-tabs" role="tablist" aria-label="Authentication modes">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={`auth-tab ${mode === "login" ? "is-active" : ""}`}
          onClick={() => { setMode("login"); setError(null); setSuccessMessage(null); }}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={`auth-tab ${mode === "register" ? "is-active" : ""}`}
          onClick={() => { setMode("register"); setError(null); setSuccessMessage(null); }}
        >
          Create account
        </button>
      </div>}

      <form className="auth-credentials-form" onSubmit={handleSubmit}>
        {mode === "recover" && <p className="auth-recovery-copy">Enter your account address. We’ll send a link to set a new password.</p>}
        {successMessage && (
          <div className="auth-success-banner" role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>
              {successMessage}
              {recoveryRequested && (
                <Link className="auth-recovery-help-link" href="/login?reset=1">
                  Link opened on localhost? Continue in Soma.
                </Link>
              )}
            </span>
          </div>
        )}
        {mode === "register" && (
          <div className="field">
            <label htmlFor="auth-name">Your name or pseudonym</label>
            <input
              id="auth-name"
              type="text"
              autoComplete="name"
              placeholder="e.g. Alex"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={loading}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        {mode !== "recover" && <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            required
            minLength={mode === "register" ? 8 : undefined}
            maxLength={mode === "register" ? 128 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>}

        {mode === "login" && (
          <button type="button" className="auth-text-action auth-forgot-password" onClick={() => { setMode("recover"); setError(null); setSuccessMessage(null); }}>
            Forgot password?
          </button>
        )}

        {error && (
          <p className="form-error auth-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="button button--primary auth-submit-btn"
          disabled={loading}
        >
          {loading ? (
            <span className="auth-loading-spinner">
              <Loader2 className="spin" size={16} aria-hidden="true" />
              {mode === "login" ? "Signing in…" : mode === "register" ? "Creating account…" : "Sending link…"}
            </span>
          ) : (
            mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send recovery link"
          )}
        </button>
      </form>
    </div>
  );
}
