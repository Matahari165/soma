-- Lot 0 : contrôles agrégés du runtime Supabase Soma.
-- À exécuter uniquement avec un accès autorisé en lecture seule.
-- Ces requêtes ne retournent ni identifiant, ni email, ni valeur de santé.
-- Ne pas enregistrer les résultats bruts dans Git : reporter seulement les
-- totaux et dates utiles dans LOT-0.md avec la date et l'environnement.

-- 1. Comptes et sessions encore valides : volumes uniquement.
select count(*) as account_count from public.soma_users;
select count(*) as active_session_count
from public.soma_sessions
where expires_at > now();

-- 2. Tables logiques effectivement présentes dans le runtime.
select table_name, count(*) as row_count,
       min(updated_at) as oldest_update,
       max(updated_at) as latest_update
from public.soma_rows
group by table_name
order by table_name;

-- 3. Fournisseurs et états de connexion, sans détail par utilisateur.
select json_data->>'provider' as provider,
       json_data->>'status' as status,
       count(*) as connection_count,
       max(updated_at) as latest_update
from public.soma_rows
where table_name = 'provider_connections'
group by 1, 2
order by 1, 2;

-- 4. États des travaux de synchronisation et d'analyse.
select table_name,
       coalesce(json_data->>'status', json_data->>'phase', 'unknown') as job_state,
       count(*) as job_count,
       max(updated_at) as latest_update
from public.soma_rows
where table_name in ('sync_jobs', 'meal_analyses')
group by 1, 2
order by 1, 2;

-- 5. Fraîcheur des jeux dérivés, sans lire leurs valeurs.
select table_name, count(*) as row_count,
       max(updated_at) as latest_update
from public.soma_rows
where table_name in (
  'daily_health_metrics', 'daily_scores', 'correlation_results',
  'health_record_archives', 'meal_photos'
)
group by table_name
order by table_name;

-- 6. Présence des formes Apple Health utilisées par la route actuelle.
select
  count(*) filter (where table_name = 'profiles' and json_data ? 'apple_health_sync_token')
    as profiles_with_apple_sync_field,
  count(*) filter (where table_name = 'daily_health_metrics' and json_data ? 'active_energy')
    as health_days_with_legacy_active_energy,
  count(*) filter (where table_name = 'daily_health_metrics' and json_data ? 'active_energy_kcal')
    as health_days_with_active_energy_kcal
from public.soma_rows;
