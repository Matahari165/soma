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

-- 5 bis. Types de mesures et couverture par fournisseur, sous forme agrégée.
select json_data->>'provider' as provider,
       json_data->>'data_type' as data_type,
       count(*) as record_count,
       min(json_data->>'civil_date') as first_civil_date,
       max(json_data->>'civil_date') as last_civil_date
from public.soma_rows
where table_name = 'health_records'
group by 1, 2
order by 1, 2;

-- 5 ter. Statut des photos et des archives, sans nom de fichier ni objet R2.
select table_name,
       case when table_name = 'meal_photos'
         then coalesce(json_data->>'storage_status', 'unknown')
         else coalesce(json_data->>'storage_backend', 'unknown') end as storage_state,
       count(*) as item_count
from public.soma_rows
where table_name in ('meal_photos', 'health_record_archives')
group by 1, 2
order by 1, 2;

-- 6. Présence des formes Apple Health utilisées par la route actuelle.
select
  count(*) filter (where table_name = 'profiles' and json_data ? 'apple_health_sync_token')
    as profiles_with_apple_sync_field,
  count(*) filter (where table_name = 'daily_health_metrics' and json_data ? 'active_energy')
    as health_days_with_legacy_active_energy,
  count(*) filter (where table_name = 'daily_health_metrics' and json_data ? 'active_energy_kcal')
    as health_days_with_active_energy_kcal
from public.soma_rows;

-- 7. Schéma physique réellement présent (noms de tables seulement).
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'daily_health_metrics', 'provider_connections',
    'soma_rows', 'soma_users', 'soma_sessions'
  )
order by table_name;

-- 8. Planificateur Supabase. Les exécutions réussies prouvent le lancement
-- du SQL par pg_cron, pas la réussite de l'appel HTTP vers Vercel.
select extname
from pg_extension
where extname in ('pg_cron', 'pg_net')
order by extname;

-- À omettre si pg_cron n'est pas installé.
select jobname, schedule, active
from cron.job
where jobname like 'soma%'
order by jobname;

select status, start_time, end_time
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'soma-sync-worker')
order by start_time desc
limit 5;
