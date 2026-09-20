# Soma natif — lot 2 : identité et sessions d'appareil

**Statut : implémentation serveur prête à vérifier en production.**

## Objectif

Permettre à un compte Soma existant d'ouvrir une session distincte sur iPhone ou Mac, puis de révoquer un appareil sans déconnecter les autres. Le Web conserve son cookie actuel. Les applications natives utilisent un jeton opaque transmis dans l'en-tête `Authorization: Bearer` et conservé uniquement dans le Keychain.

Le client Swift iPhone et Mac consomme désormais ces contrats. Il conserve les sessions Bearer dans le Keychain et réutilise le compte Web existant par email/mot de passe ou par Google.

## Décisions

- La connexion native accepte l'email et le mot de passe d'un compte existant.
- Google OAuth passe par le serveur Soma, utilise PKCE et ne transmet qu'un code éphémère à usage unique dans l'URL de retour native ; le jeton final est obtenu par un échange serveur puis stocké dans le Keychain.
- Le serveur reste l'autorité d'identité. Un client natif ne contacte jamais Supabase directement.
- Le jeton brut n'est retourné qu'à sa création. Seule son empreinte SHA-256 est stockée côté serveur.
- Chaque session reçoit un identifiant révocable, une plateforme, un nom d'appareil et une expiration.
- Une révocation supprime uniquement la session ciblée. Elle ne fusionne jamais deux comptes portant le même email.

## Contrat serveur V1

| Route | Résultat |
| --- | --- |
| `POST /api/native/v1/auth/login` | Vérifie un compte existant et crée une session `ios` ou `macos` sans cookie Web |
| `GET /api/native/v1/auth/google` | Démarre Google OAuth avec un état signé et un challenge PKCE natif |
| `POST /api/native/v1/auth/google/exchange` | Consomme une fois le code éphémère et crée la session Bearer native |
| `GET /api/native/v1/auth/session` | Retourne l'identité de la session Bearer courante |
| `DELETE /api/native/v1/auth/session` | Déconnecte et invalide la session courante |
| `GET /api/native/v1/auth/sessions` | Liste les sessions actives du compte sans exposer de jeton ni d'empreinte |
| `DELETE /api/native/v1/auth/sessions/{id}` | Révoque une session appartenant au compte courant |

La connexion est la seule route native accessible sans Bearer. Les autres routes natives exigent leur propre jeton, même si un cookie Web est présent. La route métier vérifie ensuite l'empreinte, l'expiration et le propriétaire. Un Bearer absent, invalide, expiré ou révoqué produit `401`.

## Stockage

La migration additive complète `soma_sessions` avec :

- `session_id`, identifiant public de révocation ;
- `platform`, limitée à `web`, `ios` ou `macos` ;
- `device_name`, libellé borné à 80 caractères.

Les anciennes sessions Web sont conservées et marquées comme navigateur Web. La migration existe pour Supabase et pour le stockage D1 de compatibilité.
Ses valeurs par défaut maintiennent la compatibilité pendant le déploiement progressif : une ancienne version Web peut encore créer une session avant la mise en ligne du nouveau code. L'outil de transfert D1 vers Supabase conserve aussi les nouvelles métadonnées.

## Preuve de fin

Le lot 2 sera clos lorsque les preuves suivantes seront réunies sur un compte de test :

1. une connexion iPhone et une connexion Mac retrouvent le même identifiant utilisateur que le Web ;
2. les deux appareils apparaissent comme deux sessions sans secret exposé ;
3. la révocation de l'iPhone provoque `401` sur son jeton ;
4. la session Mac et la session Web restent valides ;
5. la déconnexion courante invalide réellement le jeton côté serveur ;
6. la migration de production, la CI, le déploiement Vercel et les réponses authentifiées sont vérifiés séparément.

## Limites avant bêta

La récupération de mot de passe, la vérification d'email, la limitation des tentatives et MFA restent à concevoir avant une bêta externe. Le client Swift devra effacer son Keychain après `401`, révocation, déconnexion ou suppression de compte.
