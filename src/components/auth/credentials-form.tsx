"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function CredentialsForm({ next }: { next?: string | null }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
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

      // Successful auth
      if (next) {
        router.push(next);
      } else if (data.hasCompletedOnboarding === false || mode === "register") {
        router.push("/onboarding");
      } else {
        router.push("/");
      }
      router.refresh();
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
          onClick={() => { setMode("login"); setError(null); }}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={`auth-tab ${mode === "register" ? "is-active" : ""}`}
          onClick={() => { setMode("register"); setError(null); }}
        >
          Create account
        </button>
      </div>

      <form className="auth-credentials-form" onSubmit={handleSubmit}>
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
