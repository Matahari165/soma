-- Keep service-only tables inaccessible even if future grants change.
drop policy if exists provider_connections_server_only on public.provider_connections;
create policy provider_connections_server_only on public.provider_connections
for all to authenticated using (false) with check (false);

drop policy if exists webhook_events_server_only on public.webhook_events;
create policy webhook_events_server_only on public.webhook_events
for all to authenticated using (false) with check (false);

drop policy if exists agent_action_proposals_server_only on public.agent_action_proposals;
create policy agent_action_proposals_server_only on public.agent_action_proposals
for all to authenticated using (false) with check (false);

revoke all on public.provider_connections, public.webhook_events,
  public.agent_action_proposals from anon, authenticated;

-- Supabase creates this helper when automatic RLS is enabled. It must never be
-- callable through PostgREST by anonymous or signed-in application users.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
