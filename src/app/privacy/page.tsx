import type { Metadata } from "next";
import Link from "next/link";

import { SomaLogo } from "@/components/soma-logo";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default function PrivacyPage() {
  return (
    <main className="legal-page" id="main-page-content">
      <Link className="brand brand--auth" href="/" aria-label="Soma home"><SomaLogo /></Link>
      <article>
        <span className="eyebrow">Privacy · Version 1.1</span>
        <h1>Your health data stays yours.</h1>
        <p>Last updated August 31, 2026.</p>
        <h2>What Soma stores</h2>
        <p>Your Google account identifier, manually entered profile information, authorized Google Health data, derived scores and insights, Coach conversations, workouts, meal entries, meal photos, nutrition estimates, and the two meal feelings you choose to record.</p>
        <h2>Why Soma uses it</h2>
        <p>To show your dashboard, keep your meal history, calculate personal wellness trends and relationships, answer Coach questions, and run the features you explicitly request.</p>
        <h2>AI processing</h2>
        <p>Soma sends a limited summary of relevant metrics to xAI when you use Coach or request an analysis summary. When you explicitly analyse a meal, Soma sends the selected meal photos, their origin labels, and your optional note to the configured analysis provider (Grok by default, with ChatGPT 5.6 Sol available as a configured fallback or primary provider). OAuth tokens are never included. Requests use store: false.</p>
        <h2>Retention and control</h2>
        <p>Soma keeps your history and private meal photos until you delete them or delete your account. You can export your data, delete individual meals, disconnect Google Health, or permanently delete everything from Settings.</p>
        <h2>Important limit</h2>
        <p>Soma is a general wellness application, not a medical device. It does not diagnose or replace professional care.</p>
        <Link href="/settings">Return to settings</Link>
      </article>
    </main>
  );
}
