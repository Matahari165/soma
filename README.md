# Soma

Soma est une application personnelle de suivi de santé, de sommeil, d'activité et de nutrition. Le Personal Lab rapproche des mesures et des entrées de journal pour aider à examiner des associations au fil du temps. Ces associations ne démontrent pas une causalité et Soma n'est pas un dispositif médical.

## Organisation du code

| Dossier | Rôle actuel |
| --- | --- |
| `src/app` | Pages Next.js, routes API et tâches planifiées. |
| `src/components` | Interface React. Plusieurs écrans ont encore une logique métier à extraire progressivement. |
| `src/domain` | Calculs et règles métier, dont les scores et les repas. |
| `src/services` | Parcours métier et orchestration des opérations. |
| `src/repositories` | Accès aux données des repas et d'autres modules. |
| `src/lib/cloudflare/db.ts` | Adaptateur de compatibilité entre l'ancien stockage D1 et le stockage Supabase actuel. |
| `src/integrations` | Fournisseurs externes, dont Google Health et l'analyse des repas. |
| `supabase/migrations` | Historique SQL de Supabase ; ne pas modifier les migrations déjà appliquées. |
| `cloudflare/migrations` | Historique de l'ancien stockage D1. |

Le Web utilise Next.js 16, React 19 et TypeScript. Les données applicatives passent actuellement par un adaptateur qui conserve beaucoup de lignes dans `soma_rows.json_data` sur Supabase. La migration vers des tables relationnelles dédiées reste un travail à mener par domaine. Le serveur utilise une clé de service pour accéder à ces données : la présence de RLS dans le schéma ne signifie pas que chaque accès applicatif bénéficie aujourd'hui d'une isolation RLS par utilisateur.

Les photos et archives privées sont stockées dans Cloudflare R2. Le site est déployé sur Vercel ; le worker Cloudflare ne sert qu'à réveiller les routes planifiées. Les scores de santé sont calculés dans le code de Soma. L'analyse de photo fait appel à un fournisseur d'IA et son résultat doit être distingué des mesures de santé et des données confirmées par l'utilisateur.

## Démarrer en local

Prérequis : Node.js 24 et pnpm 11.16.0.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Pour parcourir l'interface avec des données synthétiques, renseigner `SOMA_LOCAL_PREVIEW=true` dans `.env.local`, puis lancer `pnpm dev`. Ce mode sert à explorer l'interface ; il ne valide pas les intégrations réelles.

Pour les intégrations, renseigner les variables serveur décrites dans `.env.example`. Appliquer les migrations de `supabase/migrations` dans l'ordre sur une base Supabase compatible avant de lancer une version qui en dépend. `pnpm db:migrate:supabase` copie des données D1 ; cette commande n'applique pas le schéma SQL. Ne pas placer de clés ou de données de santé dans le dépôt.

## Vérifier

```bash
CI=true pnpm verify
```

`pnpm verify` lance le lint, le contrôle TypeScript, les tests Vitest ordinaires et le build Web. Les fichiers `*.live.test.ts` demandent des intégrations réelles et ne font pas partie de cette suite. Un résultat vert ne prouve ni les migrations sur la base de production, ni une connexion authentifiée.

Les données manquantes doivent rester distinctes d'une valeur enregistrée à zéro. Cette règle s'applique aux calculs, aux API et aux graphiques ; toute modification de ces parcours doit la conserver.

## Déploiement

Le cycle normal est branche dédiée, Pull Request, CI, puis merge sur `main`. Vercel déploie automatiquement le site après ce merge. Ne pas utiliser `deploy:cloudflare` pour le site. Vérifier séparément le commit déployé, l'état des migrations nécessaires et les parcours réels concernés.

## Licence

Voir [LICENSE](LICENSE).
