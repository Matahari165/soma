"use client";

import { useState, useEffect } from "react";
import { Check, Copy, ExternalLink, Smartphone } from "lucide-react";

export function AppleHealthSyncCard() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/health/apple-sync")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.token) {
          setToken(data.token);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCopy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <article className="settings-card apple-health-sync-card" aria-labelledby="apple-health-sync-title">
      <header className="settings-card__header">
        <div className="settings-card__icon" aria-hidden="true">
          <Smartphone size={20} />
        </div>
        <div>
          <h3 id="apple-health-sync-title">Apple Health Direct Sync</h3>
          <p className="settings-card__subtitle">
            Sync Apple Watch &amp; iPhone health metrics directly to Soma using Apple Shortcuts.
          </p>
        </div>
      </header>

      <div className="apple-sync-body">
        <div className="apple-sync-token-box">
          <label htmlFor="apple-sync-key">Your Private Sync Key</label>
          <div className="apple-sync-token-row">
            <input
              id="apple-sync-key"
              type={revealed ? "text" : "password"}
              readOnly
              value={token || (loading ? "Loading key…" : "Unavailable")}
              className="apple-sync-input font-mono"
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => setRevealed(!revealed)}
              title={revealed ? "Hide key" : "Show key"}
            >
              {revealed ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={handleCopy}
              disabled={!token}
              title="Copy private sync key"
            >
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <small className="apple-sync-helper">
            Keep this key confidential. It authenticates your Apple Shortcuts to send sleep and activity data to your account.
          </small>
        </div>

        <div className="apple-sync-guide">
          <h4>Setup in 3 Steps</h4>
          <ol className="apple-sync-steps">
            <li>
              <strong>Get the Soma Shortcut</strong>
              <p>Download the prepared Apple Shortcut on your iPhone to query HealthKit.</p>
              <a
                href={`https://www.icloud.com/shortcuts/soma-health-sync`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link inline-flex items-center gap-1 mt-1"
              >
                Open Soma Health Shortcut <ExternalLink size={13} aria-hidden="true" />
              </a>
            </li>
            <li>
              <strong>Configure your Sync Key</strong>
              <p>When prompted, paste your Private Sync Key into the shortcut settings.</p>
            </li>
            <li>
              <strong>Automate Daily Sync</strong>
              <p>
                In the Apple Shortcuts app, go to <em>Automation → New Automation → Time of Day (e.g. 08:00 AM)</em>,
                select <em>Run Immediately</em>, and pick the Soma Shortcut.
              </p>
            </li>
          </ol>
        </div>
      </div>
    </article>
  );
}
