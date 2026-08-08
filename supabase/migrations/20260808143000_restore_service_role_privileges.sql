-- The service role bypasses RLS, but PostgreSQL privileges are still required.
-- Keep browser roles restricted while restoring the backend's explicit CRUD path.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Preserve the same contract for tables and sequences created by later migrations.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
