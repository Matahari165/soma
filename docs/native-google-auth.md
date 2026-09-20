# Connexion Google native

Les apps iPhone et Mac ouvrent le fournisseur Google existant dans la session web système. Google revient toujours vers le callback HTTPS de Soma sur Vercel. Le serveur échange ensuite un code natif éphémère, à usage unique et lié par PKCE, contre la session Bearer déjà utilisée par les apps. Le Bearer reste uniquement dans le Keychain et n’apparaît jamais dans le deep link.

Le nom de l’appareil n’est jamais placé dans l’URL OAuth. Il est envoyé uniquement dans le corps chiffré HTTPS de l’échange final.

## Configuration requise

### Google Cloud

- Conserver le client OAuth **Web application** déjà utilisé par Soma.
- Autoriser exactement l’URI de redirection de production :
  `https://soma-neon-phi.vercel.app/auth/callback`
- Pour un environnement de prévisualisation explicitement utilisé, ajouter son origine HTTPS exacte avec le même chemin. Ne pas utiliser de wildcard.
- Les apps natives ne nécessitent ni client secret embarqué ni nouvel URI Google personnalisé : le callback Google reste HTTPS et côté serveur.

### Vercel

- Définir côté serveur `GOOGLE_AUTH_CLIENT_ID` et `GOOGLE_AUTH_CLIENT_SECRET` pour Production, et pour Preview seulement si le flux y est testé.
- Le fallback historique `GOOGLE_HEALTH_CLIENT_ID` / `GOOGLE_HEALTH_CLIENT_SECRET` reste compatible, mais les variables `GOOGLE_AUTH_*` rendent la responsabilité plus claire.
- Conserver `NEXT_PUBLIC_SITE_URL=https://soma-neon-phi.vercel.app` en production.
- Ne jamais préfixer le secret par `NEXT_PUBLIC_` et ne jamais le placer dans Xcode.

### Supabase

- Appliquer `supabase/migrations/20260919160000_native_google_auth_codes.sql` avant d’activer le bouton en production.
- Vérifier que la table `soma_native_auth_codes` a RLS activé, aucun droit `anon`/`authenticated`, et reste accessible uniquement au `service_role`.
- Les codes expirent après deux minutes et sont supprimés atomiquement lors d’un échange PKCE réussi.

### Xcode

`Native/project.yml` déclare les callbacks suivants :

- iPhone : `com.soma.native.ios://auth/callback`
- Mac : `com.soma.native.macos://auth/callback`

Après toute modification de `project.yml`, exécuter `xcodegen generate` dans `Native/` et versionner le projet généré. Aucun entitlement OAuth supplémentaire n’est requis.

## Test réel

Un test réel est valide seulement après la migration Supabase et la configuration Vercel/Google ci-dessus. Vérifier séparément sur iPhone et Mac : choix du compte, annulation, retour dans Soma, création d’une session distincte dans Réglages, relance de l’app, puis déconnexion. Ne jamais enregistrer l’écran, les URLs complètes ou les journaux si ceux-ci peuvent contenir un code temporaire ou une donnée de compte.
