import type { Metadata } from "next";
import Link from "next/link";

import { SomaLogo } from "@/components/soma-logo";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default function PrivacyPage() {
  return (
    <main className="legal-page" id="main-page-content">
      <Link className="brand brand--auth" href="/" aria-label="Soma Home"><SomaLogo /></Link>
      <article>
        <span className="eyebrow">Privacy · Version 1.1</span>
        <h1>Your health data remains strictly yours.</h1>
        <p>Last updated: August 31, 2026.</p>
        <h2>What Soma records</h2>
        <p>Your Google account identifier or email credentials, manually entered profile details, authorized Google Health data, computed scores and analytics, workouts, meals, nutritional estimates, and logged meal feelings.</p>
        <h2>Why Soma uses it</h2>
        <p>To display your personal lab, maintain your meal history, calculate your personal wellness trends and correlations, and perform features you explicitly trigger.</p>
        <h2>AI processing</h2>
        <p>Soma transmits a bounded summary of relevant metrics to xAI when you request an analysis summary. When you analyze a meal, photos are processed ephemerally for nutritional estimation and are never retained permanently in storage. OAuth tokens and secrets are never transmitted. API requests use <code>store: false</code>.</p>
        <h2>Retention and control</h2>
        <p>Soma retains your journal and meal records until you choose to delete them or remove your account. You can export your data, delete individual meals, disconnect Google Health, or permanently erase your account anytime in Settings.</p>
        <h2>Important notice</h2>
        <p>Soma is a personal health tracking tool, not a medical device. It provides no medical diagnosis and does not replace qualified healthcare advice.</p>
        <Link href="/settings">Back to settings</Link>
      </article>
    </main>
  );
}
