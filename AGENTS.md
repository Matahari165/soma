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

## Git et sauvegardes

- Avant toute modification, inspecte la branche, l’état Git et les changements existants. L’agent gère les branches, worktrees, sauvegardes récupérables et commits locaux ; préserve le travail hors périmètre.
- N’utilise jamais de reset, d’écrasement ou de suppression destructive. Utilise des branches ou worktrees séparés pour les lots parallèles et relis toujours le diff final.
- Le push, notamment vers `main`, la publication, le déploiement et toute modification externe exigent un ordre explicite.
- N’exécute pas `pnpm install`, `pnpm verify` ou un build Next pendant qu’un serveur `next dev` utilise le même checkout. Pour la vérification complète, utilise `CI=true pnpm verify`.

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
