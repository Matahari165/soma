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
          <span className="eyebrow">Your body, over time</span>
          <h1>Know your<br /> <em>own rhythm.</em></h1>
          <p>Sleep, recovery, movement, and training — mapped against the person you were yesterday.</p>
        </div>
        <div className="auth-principles">
          <span><HeartPulse size={18} /> Your baseline</span>
          <span><Activity size={18} /> Honest gaps</span>
          <span><LockKeyhole size={18} /> Your data</span>
        </div>
      </section>
      <section className="auth-card-wrap">
        <div className="auth-card">
          <span className="eyebrow">Living Atlas</span>
          <h2>A clearer view of you.</h2>
          <p>Your first useful patterns appear as measurements arrive.</p>
          <Link className="google-button" href="/login"><LogIn size={19} /> Sign in to Soma</Link>
          <div className="auth-consent-note">Google Health is optional, read-only, and reversible.</div>
          <p className="legal-copy"><Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link></p>
        </div>
      </section>
    </main>
  );
}
