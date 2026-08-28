## Règles du projet Soma

### Communication et cadrage

- Réponds en français, simplement et sans phrases inutiles. Commence par la conclusion utile.
- Avant toute modification, donne un plan court, les hypothèses importantes et les critères de réussite.
- Si une ambiguïté peut changer significativement le résultat, pose une seule question et attends la réponse avant de coder.
- Une demande de conseil, d'explication, d'audit ou de lecture seule n'autorise aucune modification.

### Données de santé

- Distingue toujours les données provenant d'une source de santé des métriques calculées par Soma.
- Ne mets jamais dans le code, Git, les journaux ou les réponses des exports de santé, identifiants, clés, jetons, sessions ou autres données personnelles sensibles.

### Interface et expérience utilisateur

- Conserve une identité visuelle cohérente et intentionnelle ; évite l'apparence générique des applications générées par IA, les cartes répétitives et les grands espaces vides sans fonction.
- Simplifie d'abord l'écran principal et place les explications ou données denses dans un détail accessible au clic.
- Chaque texte visible doit aider à comprendre, décider ou agir. Le titre de l'onglet reste `Soma`.
- Vérifie par défaut les formats MacBook Air `1440x900`, iPhone `390x844` et les largeurs intermédiaires utiles.
- Vérifie contraste, lisibilité, clavier, focus visible, zones tactiles et information indépendante de la couleur.
- Utilise le navigateur intégré pour toute modification visuelle ou interactive significative ; une petite correction évidente peut recevoir une vérification proportionnée.
- Lorsqu'une modification peut affecter significativement l'interface ou l'expérience utilisateur, demande une revue indépendante à la conversation permanente `UI/UX` du projet lorsqu'elle est disponible.
- Ne sollicite pas `UI/UX` pour une modification purement technique ou une différence visuelle triviale sans impact utilisateur réel.

### Développement, qualité et Git

- Inspecte les conventions et l'état Git avant de modifier. Préserve les changements existants et reste strictement dans le périmètre demandé.
- Utilise la solution la plus simple qui répond au besoin, réutilise l'existant et n'ajoute pas de dépendance sans bénéfice clair.
- Utilise une branche par modification cohérente et livrable ; ne mélange pas deux sujets indépendants.
- Après une modification, vérifie selon le risque : cas normal, chargement, absence de données, erreur, responsive, accessibilité, types, lint, tests et build pertinents.
- Ne lance jamais `pnpm install`, `pnpm verify` ou un build Next pendant qu'un serveur `next dev` utilise le même checkout : ces commandes peuvent réorganiser `node_modules` ou `.next` et casser Turbopack. Arrête le serveur, exécute les opérations séquentiellement, puis relance-le.
- Pendant une itération UI locale, utilise les exécutables déjà installés dans `node_modules/.bin` pour les contrôles ciblés afin de ne pas déclencher une réinstallation implicite de pnpm.
- Pour une vérification complète du projet, utilise `CI=true pnpm verify`.
- Relis le diff final. Un commit local, un push, un déploiement et une vérification en production sont des preuves distinctes : ne présente jamais l'une comme la preuve d'une autre.
- Ne publie, ne déploie, n'envoie de message et ne modifie aucun service externe sans autorisation explicite.

### Délégation, coût et revue

- L'agent principal reste responsable du plan, de l'architecture, des décisions finales, de l'intégration, des conflits, des vérifications et de la synthèse.
- Utilise au moins un sous-agent dès qu'une tâche comporte une étape qui peut utilement être analysée, recherchée, exécutée ou vérifiée séparément, même si cette étape est relativement petite.
- N'utilise pas de sous-agent uniquement lorsqu'une tâche est réellement triviale et que la délégation n'apporterait aucune valeur pratique.
- Lorsque le choix du modèle est disponible, tous les sous-agents doivent utiliser exclusivement Luna `high` ou Luna `xhigh`. N'utilise jamais Sol ni un autre modèle comme sous-agent.
- Utilise Luna `high` par défaut afin de limiter le coût. Réserve Luna `xhigh` aux analyses difficiles, diagnostics ambigus, recherches de bugs, revues critiques ou vérifications indépendantes où le niveau supplémentaire de raisonnement apporte une valeur réelle.
- Utilise les sous-agents pour le travail borné et parallélisable. Évite les délégations redondantes ou plusieurs agents faisant essentiellement le même travail sans justification.
- Une conversation qui développe une fonctionnalité reste propriétaire de cette fonctionnalité jusqu'à sa validation finale.

### Revue indépendante

- Pour une modification importante, risquée ou suffisamment large pour qu'une seconde lecture puisse raisonnablement trouver des problèmes, demande une revue indépendante à la conversation permanente `Reviewer` du projet lorsqu'elle est disponible.
- Le Reviewer doit chercher activement bugs, régressions, cas limites, effets de bord, complexité inutile et écarts par rapport à la demande.
- N'utilise pas systématiquement le Reviewer pour les petites modifications évidentes : le bénéfice attendu de la revue doit justifier le coût supplémentaire.
- Si une revue indépendante est nécessaire mais que la conversation `Reviewer` n'est pas disponible, utilise un sous-agent Luna `xhigh` comme reviewer indépendant.
- Le Reviewer ne devient pas propriétaire de la fonctionnalité : la conversation propriétaire reçoit ses conclusions, décide des corrections, les applique et effectue les vérifications finales.
- Si un changement important touche à la fois au fonctionnement et à l'expérience utilisateur, les conversations `REVIEWER` et `UI/UX` peuvent toutes les deux être sollicitées, chacune uniquement sur son domaine.

### Apprentissage et restitution

- Après une étape technique importante, explique brièvement ce qui fonctionne, comment et pourquoi, avec un exemple concret si cela aide.
- Pour un audit ou un diagnostic, sépare clairement les faits vérifiés, les hypothèses, les causes écartées et les inconnues.
- Termine toute modification par : ce qui a changé, les vérifications effectuées, puis les limites ou risques restants.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->