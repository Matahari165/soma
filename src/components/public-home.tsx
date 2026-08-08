import { Activity, HeartPulse, LockKeyhole, LogIn } from "lucide-react";
import Link from "next/link";

import { SomaLogo } from "@/components/soma-logo";

export function PublicHome() {
  return (
    <main className="auth-page" id="main-page-content">
      <section className="auth-intro">
        <div className="brand brand--auth" aria-label="Soma">
          <SomaLogo />
        </div>
        <div className="auth-intro__copy">
          <span className="eyebrow">Personal physiology · Vital Signal</span>
          <h1>Read the signal.<br />See your state clearly.</h1>
          <p>Soma turns scattered sleep, recovery, and activity measurements into one calm reading grounded in your own history.</p>
        </div>
        <div className="auth-principles">
          <span><HeartPulse size={18} /> Read-only Google Health connection</span>
          <span><Activity size={18} /> Personal baselines and honest missing-data states</span>
          <span><LockKeyhole size={18} /> Private account, explicit consent, and full deletion controls</span>
        </div>
      </section>
      <section className="auth-card-wrap">
        <div className="auth-card">
          <span className="eyebrow">Soma</span>
          <h2>Your body&apos;s signals, brought into focus.</h2>
          <p>Connect your account, complete onboarding, and let Soma build useful signals as your real measurements arrive.</p>
          <Link className="google-button" href="/login"><LogIn size={19} /> Sign in to Soma</Link>
          <div className="auth-consent-note">Soma supports general wellness and is not a medical device. Google Health access is optional, read-only, and can be disconnected at any time.</div>
          <p className="legal-copy"><Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link></p>
        </div>
      </section>
    </main>
  );
}
