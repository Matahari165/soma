"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export function CredentialsForm({ next }: { next?: string | null }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload = mode === "login"
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
        setError(data.error || (mode === "login" ? "Invalid email or password." : "Failed to create account."));
        setLoading(false);
        return;
      }

      if (mode === "register") {
        // SaaS transition: show clear feedback, switch to login tab, prefill email
        setMode("login");
        setPassword("");
        setSuccessMessage("If the address can be used, you can now sign in with your password.");
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
      <div className="auth-tabs" role="tablist" aria-label="Authentication modes">
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
      </div>

      <form className="auth-credentials-form" onSubmit={handleSubmit}>
        {successMessage && (
          <div className="auth-success-banner" role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{successMessage}</span>
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

        <div className="field">
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
        </div>

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
              {mode === "login" ? "Signing in…" : "Creating account…"}
            </span>
          ) : (
            mode === "login" ? "Sign in" : "Create account"
          )}
        </button>
      </form>
    </div>
  );
}
