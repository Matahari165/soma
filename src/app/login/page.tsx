import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { SomaLogo } from "@/components/soma-logo";
import { getCurrentUser } from "@/lib/auth";
import { hasCloudflareConfig } from "@/lib/env";

export const metadata: Metadata = { title: { absolute: "Connexion — Soma" } };

const authErrors: Record<string, string> = {
  configuration: "La connexion n’est pas disponible dans cet environnement.",
  auth_service: "Le service Google est momentanément indisponible. Réessayez dans un instant.",
  oauth_start: "La connexion Google n’a pas pu démarrer. Réessayez.",
  missing_code: "Google n’a pas renvoyé de code de connexion. Réessayez.",
  oauth_callback: "La connexion Google n’a pas pu être terminée. Réessayez.",
  oauth_state: "La session de connexion a expiré. Réessayez.",
  oauth_profile: "Votre profil Google n’a pas pu être récupéré. Réessayez.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; deleted?: string }> }) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (user) redirect("/");
  const configured = hasCloudflareConfig();
  const errorCode = params.error;
  const errorMessage = errorCode ? authErrors[errorCode] ?? "La connexion Google n’a pas pu être terminée." : null;
  const nextParam = typeof params.next === "string" ? params.next : null;
  const nextPath = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") && nextParam.length <= 200 && !nextParam.includes("\\") && !/\s/.test(nextParam) && !nextParam.includes("@") && !nextParam.includes(":") ? nextParam : null;
  const deleted = params.deleted === "1";

  return (
    <main className="auth-page" id="main-page-content">
      <section className="auth-intro" aria-labelledby="auth-intro-title">
        <Link className="brand brand--auth" href="/" aria-label="Accueil Soma">
          <SomaLogo />
        </Link>
        <div className="auth-intro__copy">
          <h1 id="auth-intro-title">Vous revoilà<br /><em>chez Soma.</em></h1>
        </div>
      </section>
      <section className="auth-card-wrap" aria-labelledby="auth-title">
        <div className="auth-card">
          <h2 id="auth-title">Se connecter</h2>
          {deleted && <p className="configuration-note" role="status">Votre compte et vos données Soma ont été supprimés.</p>}
          {configured ? (
            <GoogleSignInButton next={nextPath} />
          ) : (
            <p className="configuration-note" role="alert">La connexion Google n’est pas encore configurée.</p>
          )}
          {errorMessage && <p className="form-error auth-error" role="alert">{errorMessage}</p>}
          <p className="legal-copy">En continuant, vous acceptez les <Link href="/terms">Conditions d’utilisation</Link> et reconnaissez la <Link href="/privacy">Politique de confidentialité</Link>.</p>
        </div>
      </section>
    </main>
  );
}
