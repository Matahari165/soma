# Règles du projet Soma

## Délégation et coordination

- L’agent principal est le coordinateur : il fixe le périmètre, délègue, arbitre, intègre et vérifie.
- Pour toute tâche qui demande du travail, lance systématiquement 1 à 3 sous-agents **GPT-5.6 Luna**. Utilise `xhigh` par défaut et `max` dès qu’un besoin de profondeur, de complexité, d’ambiguïté ou de risque apparaît, même faible.
- Découpe le travail en lots autonomes et parallèles lorsque possible. Donne à chaque agent une mission, des fichiers et des invariants disjoints, ainsi qu’une preuve attendue. Évite doublons et chevauchements ; l’agent principal reste responsable du résultat final.
- Si plusieurs agents ou conversations travaillent sur Soma, ils se contactent directement pour annoncer leur périmètre, gérer les dépendances et résoudre les conflits.

## Produit, données et sécurité

- Soma est un outil personnel de suivi et d’analyse de santé et de nutrition : Personal Lab, repas, sommeil, récupération, effort et réglages. `Strongest Effects` est le cœur analytique.
- Distingue les données provenant d’une source de santé des métriques calculées par Soma. Une absence de donnée n’est jamais zéro ; respecte la réalité des repas.
- Ne mets jamais de données de santé, identifiants, clés, jetons, sessions ou autres données personnelles dans le code, Git, les journaux ou les réponses.

## Git et sauvegardes — IMPORTANT, À CHAQUE TÂCHE

- Règle obligatoire pour chaque agent : toute nouvelle feature, correction ou refactor significatif commence sur une branche dédiée créée depuis `main` à jour. Ne travaille jamais directement sur `main`.
- Avant de modifier, vérifie la branche, l’état Git, les worktrees et les changements existants. Préserve toujours les modifications non liées ; ne change pas de branche et ne supprime rien si un travail non enregistré peut être concerné.
- Un lot cohérent = une branche. Pour le travail parallèle, sépare les worktrees et les fichiers afin d’éviter les conflits. N’utilise jamais `reset`, force push, écrasement d’historique ou rebase destructif sans ordre explicite.
- Avant de sauvegarder, inspecte le diff, les fichiers sensibles et les chemins ajoutés. Crée un commit clair et ciblé, puis vérifie les contrôles pertinents.
- Le workflow normal est : branche → modifications → commit → push de la branche → Pull Request vers `main` → CI verte (`lint`, `typecheck`, tests, build) → merge. Un push n’est pas un merge.
- Ne pousse jamais directement sur `main`. Le push, la PR, le merge, la suppression distante, la publication et le déploiement exigent un ordre explicite.
- Après un merge confirmé, supprime la branche locale et distante seulement si elle ne contient plus de travail unique, n’a pas de worktree actif et n’est pas douteuse. Ne supprime jamais une branche non fusionnée ou en cours ; les commits déjà dans `main` restent conservés.
- Après chaque opération GitHub, vérifie séparément la branche distante, le commit de `main`, la CI et l’état final du dépôt. Si une vérification manque, dis-le clairement.
- N’exécute pas `pnpm install`, `pnpm verify` ou un build Next pendant qu’un serveur `next dev` utilise le même checkout. Pour la vérification complète, utilise `CI=true pnpm verify`.
- Un serveur local est une ressource temporaire : lance-le seulement lorsqu’une vérification en navigateur l’exige, puis arrête-le dès qu’il n’est plus utile. Si une nouvelle vérification devient nécessaire, relance-le plutôt que de le laisser consommer inutilement la mémoire de la machine.

## Hébergement et Déploiement — VERCEL EXCLUSIF (JAMAIS CLOUDFLARE)

- **Soma est hébergé et déployé à 100% sur Vercel** (`https://soma-neon-phi.vercel.app`).
- **Le déploiement en production est ENTIÈREMENT AUTOMATISÉ par Vercel** à chaque merge d'une Pull Request sur la branche `main`.
- **INTERDICTION FORMELLE DE DÉPLOYER L'APPLICATION SUR CLOUDFLARE.** Ne lance jamais de déploiement d'application, de pages ou de site vers Cloudflare.
- **Rôle unique et délimité de Cloudflare** :
  1. Stockage d'archives de santé sur Cloudflare R2 (`soma-health-record-archives`).
  2. Un worker d'ordonnancement cron ultra-léger (`cloudflare/worker.ts`) servant uniquement d'horloge pour réveiller les routes Vercel (`/api/cron/*`).
- Ne lance jamais `deploy:cloudflare` ou de build OpenNext pour déployer le site. Le seul et unique cycle de déploiement de l'application est : **branche → modifications → PR → CI verte → merge sur `main` → déploiement automatique Vercel**.

## Interface et QA visuelle

- Avant toute création, refonte ou modification visuelle, lis `DESIGN.md` en entier et inspecte la page `/` réellement rendue. C’est la référence du thème, de la typographie, de la palette, des composants et du mouvement.
- Pour toute conception, refonte, critique ou amélioration d’interface, utilise le plugin `impeccable`. Évite l’AI slop et les thèmes génériques ; supprime les micro-phrases superficielles et les textes décoratifs.
- Pour toute modification visuelle un peu importante, vérifie le rendu dans le navigateur intégré à `1440 × 900`, `390 × 844` et aux largeurs intermédiaires utiles. Contrôle aussi états, contraste, clavier, focus, zones tactiles et information indépendante de la couleur.

## Vérification et communication

- Après une modification, vérifie les états normal, chargement, vide, erreur, responsive, accessibilité, types, lint, tests et build pertinents. Sépare les preuves locales, Git, du déploiement et du comportement authentifié en production.
- Réponds en français simple, directement et sans phrases inutiles. Pour un audit ou un diagnostic, distingue faits vérifiés, hypothèses, causes écartées et inconnues. Une demande de conseil, d’audit ou de lecture seule n’autorise aucune modification.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
