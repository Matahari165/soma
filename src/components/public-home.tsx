import { Activity, HeartPulse, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";

export function PublicHome() {
  return (
    <main className="auth-page" id="main-page-content">
      <section className="auth-intro">
        <div className="brand brand--auth" aria-label="Soma">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>Soma</span>
        </div>
        <div className="auth-intro__copy">
          <span className="eyebrow">Personal health intelligence</span>
          <h1>Understand your health.<br />Act with confidence.</h1>
          <p>Soma turns your Google Health sleep, recovery, and activity data into clear daily guidance grounded in your own history.</p>
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
          <h2>Your daily health, made understandable.</h2>
          <p>Connect your account, complete onboarding, and let Soma build useful signals as your real measurements arrive.</p>
          <Link className="google-button" href="/login"><Sparkles size={19} /> Sign in to Soma</Link>
          <div className="auth-consent-note">Soma supports general wellness and is not a medical device. Google Health access is optional, read-only, and can be disconnected at any time.</div>
          <p className="legal-copy"><Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link></p>
        </div>
      </section>
    </main>
  );
}
