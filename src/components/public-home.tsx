import { LogIn } from "lucide-react";
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
          <h1>Read your<br /> <em>own rhythm.</em></h1>
          <p>Sleep, recovery, movement, and training — measured against you.</p>
        </div>
      </section>
      <section className="auth-card-wrap">
        <div className="auth-card">
          <h2>Your signals. One view.</h2>
          <p>Useful patterns emerge as your history grows.</p>
          <Link className="google-button" href="/login"><LogIn size={19} /> Sign in to Soma</Link>
          <div className="auth-consent-note">Google Health is optional, read-only, and reversible.</div>
          <p className="legal-copy"><Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link></p>
        </div>
      </section>
    </main>
  );
}
