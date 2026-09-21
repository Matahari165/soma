import type { Metadata } from "next";
import Link from "next/link";

import { SomaLogo } from "@/components/soma-logo";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default function PrivacyPage() {
  return (
    <main className="legal-page" id="main-page-content">
      <Link className="brand brand--auth" href="/" aria-label="Soma Home"><SomaLogo /></Link>
      <article>
        <span className="eyebrow">Privacy · Version 1.2</span>
        <h1>Your health data remains strictly yours.</h1>
        <p>Last updated: September 21, 2026.</p>
        <h2>What Soma records</h2>
        <p>Your Google account identifier or email credentials, manually entered profile details, authorized Google Health data, computed scores and analytics, workouts, meals, nutritional estimates, and logged meal feelings.</p>
        <h2>Why Soma uses it</h2>
        <p>To display your personal lab, maintain your meal and assistant history, calculate your personal wellness trends and correlations, and perform features you explicitly trigger.</p>
        <h2>AI processing</h2>
        <p>Soma transmits only the conversation, bounded health context, and photos you explicitly attach to the current request to xAI. It does not resend historical conversation photos automatically and does not use external web search. Meal-analysis photos are removed after confirmation according to the meal retention policy. Photos attached to an assistant conversation remain private in Soma storage until you delete them, the conversation, or your account. OAuth tokens and secrets are never transmitted. xAI API requests use <code>store: false</code>.</p>
        <h2>Retention and control</h2>
        <p>Soma retains your journal, meal and assistant records until you choose to delete them or remove your account. You can export your data, delete individual conversations or meals, disconnect Google Health, or permanently erase your account anytime in Settings.</p>
        <h2>Important notice</h2>
        <p>Soma is a personal health tracking tool, not a medical device. It provides no medical diagnosis and does not replace qualified healthcare advice.</p>
        <Link href="/settings">Back to settings</Link>
      </article>
    </main>
  );
}
