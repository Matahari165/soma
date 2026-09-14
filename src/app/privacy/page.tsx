import type { Metadata } from "next";
import Link from "next/link";

import { SomaLogo } from "@/components/soma-logo";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default function PrivacyPage() {
  return (
    <main className="legal-page" id="main-page-content">
      <Link className="brand brand--auth" href="/" aria-label="Accueil Soma"><SomaLogo /></Link>
      <article>
        <span className="eyebrow">Confidentialité · Version 1.1</span>
        <h1>Vos données de santé restent les vôtres.</h1>
        <p>Dernière mise à jour : 31 août 2026.</p>
        <h2>Ce que Soma enregistre</h2>
        <p>Votre identifiant de compte Google, les informations de profil saisies manuellement, les données Google Health autorisées, les scores et analyses calculés, les entraînements, les repas, les photos de repas, les estimations nutritionnelles et les deux ressentis de repas que vous choisissez d’enregistrer.</p>
        <h2>Pourquoi Soma les utilise</h2>
        <p>Pour afficher votre tableau de bord, conserver votre historique de repas, calculer vos tendances et relations de bien-être personnelles, et exécuter les fonctions que vous demandez explicitement.</p>
        <h2>Traitement par l’IA</h2>
        <p>Soma envoie un résumé limité des métriques pertinentes à xAI lorsque vous demandez une synthèse d’analyse. Lorsque vous analysez explicitement un repas, Soma envoie les photos sélectionnées, leurs libellés d’origine et votre note facultative au fournisseur d’analyse configuré (Grok par défaut, avec ChatGPT 5.6 Sol comme solution de secours ou fournisseur principal configuré). Les jetons OAuth ne sont jamais inclus. Les requêtes utilisent <code>store: false</code>.</p>
        <h2>Conservation et contrôle</h2>
        <p>Soma conserve votre historique et vos photos de repas privées jusqu’à ce que vous les supprimiez ou supprimiez votre compte. Vous pouvez exporter vos données, supprimer des repas individuellement, déconnecter Google Health ou tout supprimer définitivement depuis les réglages.</p>
        <h2>Limite importante</h2>
        <p>Soma est une application générale de bien-être, pas un dispositif médical. Elle n’établit aucun diagnostic et ne remplace pas un professionnel de santé.</p>
        <Link href="/settings">Retour aux réglages</Link>
      </article>
    </main>
  );
}
