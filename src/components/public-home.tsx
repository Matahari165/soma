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
          <h1>Lisez votre<br /> <em>propre rythme.</em></h1>
          <p>Sommeil, récupération, mouvement et entraînement — mesurés par rapport à vous.</p>
        </div>
      </section>
      <section className="auth-card-wrap">
        <div className="auth-card">
          <h2>Vos signaux. Une seule vue.</h2>
          <p>Des tendances utiles apparaissent au fil de votre historique.</p>
          <a className="google-button" href="/login"><LogIn size={19} /> Se connecter à Soma</a>
          <div className="auth-consent-note">Google Health est facultatif, en lecture seule et réversible.</div>
          <p className="legal-copy"><Link href="/privacy">Politique de confidentialité</Link> · <Link href="/terms">Conditions d’utilisation</Link></p>
        </div>
      </section>
    </main>
  );
}
