-- Relational foundation for Soma's controlled conversational assistant.
-- The application user identity is public.soma_users.id (text). All mutations
-- are performed server-side after the authenticated Soma session is resolved.

create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.soma_users(id) on delete cascade,
  title text check (title is null or char_length(title) <= 160),
  status text not null default 'active' check (status in ('active', 'archived')),
  summary text check (summary is null or char_length(summary) <= 12000),
  summary_through_sequence integer not null default 0 check (summary_through_sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  conversation_id uuid not null,
  sequence integer not null check (sequence > 0),
  role text not null check (role in ('user', 'assistant', 'tool')),
  parts jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  status text not null default 'completed' check (status in ('pending', 'streaming', 'completed', 'failed', 'cancelled')),
  parent_message_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, conversation_id, id),
  unique (user_id, conversation_id, sequence),
  foreign key (user_id, conversation_id)
    references public.assistant_conversations(user_id, id) on delete cascade,
  foreign key (user_id, conversation_id, parent_message_id)
    references public.assistant_messages(user_id, conversation_id, id) on delete set null
);

create table public.assistant_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  conversation_id uuid not null,
  triggering_message_id uuid,
  output_message_id uuid,
  request_id text not null check (char_length(request_id) between 8 and 200),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  quality text not null check (quality in ('fast', 'balanced', 'deep')),
  provider text,
  model text,
  prompt_version text not null,
  input_hash text check (input_hash is null or input_hash ~ '^[0-9a-f]{64}$'),
  usage jsonb,
  estimated_cost_micros bigint check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  finish_reason text,
  web_searched boolean not null default false,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, request_id),
  foreign key (user_id, conversation_id)
    references public.assistant_conversations(user_id, id) on delete cascade,
  foreign key (user_id, conversation_id, triggering_message_id)
    references public.assistant_messages(user_id, conversation_id, id) on delete set null,
  foreign key (user_id, conversation_id, output_message_id)
    references public.assistant_messages(user_id, conversation_id, id) on delete set null
);

create table public.assistant_tool_calls (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  run_id uuid not null,
  tool_name text not null check (char_length(tool_name) between 1 and 120),
  operation_class text not null check (operation_class in ('read', 'propose', 'execute_confirmed', 'undo')),
  status text not null check (status in ('requested', 'running', 'completed', 'failed')),
  arguments_manifest jsonb not null default '{}'::jsonb,
  result_manifest jsonb,
  idempotency_key text not null,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, id),
  unique (user_id, idempotency_key),
  foreign key (user_id, run_id)
    references public.assistant_runs(user_id, id) on delete cascade
);

create table public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.soma_users(id) on delete cascade,
  kind text not null check (kind in ('preference', 'constraint', 'routine', 'fact', 'instruction')),
  content text not null check (char_length(content) between 1 and 4000),
  structured_value jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected', 'superseded')),
  sensitivity text not null default 'personal' check (sensitivity in ('ordinary', 'personal', 'health')),
  source_message_id uuid,
  confirmed_by_message_id uuid,
  valid_from date,
  valid_until date check (valid_until is null or valid_from is null or valid_until >= valid_from),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, source_message_id)
    references public.assistant_messages(user_id, id) on delete set null,
  foreign key (user_id, confirmed_by_message_id)
    references public.assistant_messages(user_id, id) on delete set null,
  check ((status = 'confirmed' and confirmed_at is not null and confirmed_by_message_id is not null) or status <> 'confirmed')
);

create table public.assistant_goal_sets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.soma_users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'archived')),
  primary_direction text not null check (char_length(primary_direction) between 1 and 240),
  secondary_directions jsonb not null default '[]'::jsonb check (jsonb_typeof(secondary_directions) = 'array'),
  confirmed_by_message_id uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, confirmed_by_message_id)
    references public.assistant_messages(user_id, id) on delete set null,
  check ((status = 'confirmed' and confirmed_at is not null and confirmed_by_message_id is not null) or status <> 'confirmed')
);

create table public.assistant_goals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  goal_set_id uuid not null,
  position integer not null check (position >= 0),
  label text not null check (char_length(label) between 1 and 500),
  domain text check (domain is null or domain in ('nutrition', 'sleep', 'recovery', 'effort', 'cross_domain', 'other')),
  baseline jsonb,
  target jsonb,
  horizon jsonb,
  cadence jsonb,
  constraints jsonb not null default '[]'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  source_message_id uuid,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, goal_set_id, position),
  foreign key (user_id, goal_set_id)
    references public.assistant_goal_sets(user_id, id) on delete cascade,
  foreign key (user_id, source_message_id)
    references public.assistant_messages(user_id, id) on delete set null
);

create table public.assistant_plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.soma_users(id) on delete cascade,
  goal_set_id uuid,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, goal_set_id)
    references public.assistant_goal_sets(user_id, id) on delete set null
);

create table public.assistant_plan_versions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  plan_id uuid not null,
  version integer not null check (version > 0),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'superseded')),
  based_on_version integer check (based_on_version is null or based_on_version > 0),
  source_message_id uuid,
  confirmed_by_message_id uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, plan_id, version),
  foreign key (user_id, plan_id)
    references public.assistant_plans(user_id, id) on delete cascade,
  foreign key (user_id, source_message_id)
    references public.assistant_messages(user_id, id) on delete set null,
  foreign key (user_id, confirmed_by_message_id)
    references public.assistant_messages(user_id, id) on delete set null,
  check ((status = 'confirmed' and confirmed_at is not null and confirmed_by_message_id is not null) or status <> 'confirmed')
);

create table public.assistant_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  conversation_id uuid not null,
  message_id uuid,
  object_path text not null,
  media_type text not null check (media_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  byte_size bigint not null check (byte_size between 1 and 15728640),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  purpose text not null default 'context' check (purpose in ('meal', 'context')),
  status text not null default 'available' check (status in ('available', 'processed', 'failed', 'deleted')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (object_path),
  foreign key (user_id, conversation_id)
    references public.assistant_conversations(user_id, id) on delete cascade,
  foreign key (user_id, conversation_id, message_id)
    references public.assistant_messages(user_id, conversation_id, id) on delete set null,
  check (
    left(object_path, char_length('assistant/' || user_id || '/' || conversation_id::text || '/'))
      = 'assistant/' || user_id || '/' || conversation_id::text || '/'
    and char_length(object_path) > char_length('assistant/' || user_id || '/' || conversation_id::text || '/')
    and position('..' in object_path) = 0
  )
);

create table public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  conversation_id uuid not null,
  run_id uuid,
  action_type text not null check (action_type in ('meal.create', 'goal_set.confirm', 'goal.update', 'plan_version.confirm', 'memory.confirm', 'memory.reject')),
  state text not null default 'proposed' check (state in ('proposed', 'confirmed', 'executing', 'executed', 'undoing', 'undone', 'failed', 'expired')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  inverse_payload jsonb,
  confirmation_message_id uuid,
  idempotency_key text not null,
  target_type text,
  target_id text,
  confirmed_at timestamptz,
  executed_at timestamptz,
  undo_deadline timestamptz,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, idempotency_key),
  foreign key (user_id, conversation_id)
    references public.assistant_conversations(user_id, id) on delete cascade,
  foreign key (user_id, run_id)
    references public.assistant_runs(user_id, id) on delete set null,
  foreign key (user_id, conversation_id, confirmation_message_id)
    references public.assistant_messages(user_id, conversation_id, id) on delete set null,
  check (state = 'proposed' or (confirmation_message_id is not null and confirmed_at is not null))
);

create table public.assistant_action_events (
  id bigint generated always as identity primary key,
  user_id text not null,
  action_id uuid not null,
  from_state text,
  to_state text not null,
  reason_code text,
  created_at timestamptz not null default now(),
  foreign key (user_id, action_id)
    references public.assistant_actions(user_id, id) on delete cascade
);

create unique index assistant_one_active_run_idx on public.assistant_runs(user_id, conversation_id)
  where status in ('queued', 'running');
create unique index assistant_one_confirmed_goal_set_idx on public.assistant_goal_sets(user_id)
  where status = 'confirmed';
create unique index assistant_one_confirmed_plan_version_idx on public.assistant_plan_versions(user_id, plan_id)
  where status = 'confirmed';
create index assistant_conversations_user_updated_idx on public.assistant_conversations(user_id, updated_at desc);
create index assistant_messages_conversation_sequence_idx on public.assistant_messages(user_id, conversation_id, sequence);
create index assistant_runs_user_status_idx on public.assistant_runs(user_id, status, created_at desc);
create index assistant_tool_calls_run_idx on public.assistant_tool_calls(user_id, run_id, created_at);
create index assistant_memories_user_status_idx on public.assistant_memories(user_id, status, kind, updated_at desc);
create index assistant_goals_set_position_idx on public.assistant_goals(user_id, goal_set_id, position);
create index assistant_plans_user_status_idx on public.assistant_plans(user_id, status, updated_at desc);
create index assistant_plan_versions_plan_idx on public.assistant_plan_versions(user_id, plan_id, version desc);
create index assistant_attachments_conversation_idx on public.assistant_attachments(user_id, conversation_id, created_at desc);
create index assistant_actions_user_state_idx on public.assistant_actions(user_id, state, created_at desc);

create or replace function public.assistant_set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger assistant_conversations_set_updated_at before update on public.assistant_conversations
for each row execute function public.assistant_set_updated_at();
create trigger assistant_memories_set_updated_at before update on public.assistant_memories
for each row execute function public.assistant_set_updated_at();
create trigger assistant_goal_sets_set_updated_at before update on public.assistant_goal_sets
for each row execute function public.assistant_set_updated_at();
create trigger assistant_goals_set_updated_at before update on public.assistant_goals
for each row execute function public.assistant_set_updated_at();
create trigger assistant_plans_set_updated_at before update on public.assistant_plans
for each row execute function public.assistant_set_updated_at();

create or replace function public.owns_soma_user(p_user_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.soma_auth_identities identity
    where identity.auth_user_id = auth.uid() and identity.soma_user_id = p_user_id
  );
$$;

revoke all on function public.owns_soma_user(text) from public, anon;
grant execute on function public.owns_soma_user(text) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'assistant_conversations', 'assistant_messages', 'assistant_runs',
    'assistant_tool_calls', 'assistant_memories', 'assistant_goal_sets',
    'assistant_goals', 'assistant_plans', 'assistant_plan_versions',
    'assistant_attachments', 'assistant_actions', 'assistant_action_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.owns_soma_user(user_id))',
      table_name || '_read_own', table_name
    );
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

grant usage, select on sequence public.assistant_action_events_id_seq to service_role;

create or replace function public.create_assistant_run(
  p_user_id text,
  p_run_id uuid,
  p_conversation_id uuid,
  p_triggering_message_id uuid,
  p_request_id text,
  p_quality text,
  p_model text,
  p_prompt_version text
)
returns public.assistant_runs
language plpgsql
security definer
set search_path = ''
as $$
declare v_run public.assistant_runs;
begin
  if p_quality not in ('fast', 'balanced', 'deep')
     or char_length(p_request_id) not between 8 and 200
     or char_length(p_prompt_version) < 1 then
    raise exception 'Invalid assistant run' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.assistant_messages
    where id = p_triggering_message_id
      and user_id = p_user_id
      and conversation_id = p_conversation_id
      and role = 'user'
  ) then
    raise exception 'Assistant triggering message not found' using errcode = '23503';
  end if;

  insert into public.assistant_runs (
    id, user_id, conversation_id, triggering_message_id, request_id,
    status, quality, model, prompt_version
  ) values (
    p_run_id, p_user_id, p_conversation_id, p_triggering_message_id, p_request_id,
    'queued', p_quality, p_model, p_prompt_version
  )
  on conflict (user_id, request_id) do nothing
  returning * into v_run;

  if v_run.id is null then
    select * into v_run from public.assistant_runs
      where user_id = p_user_id and request_id = p_request_id;
    if v_run.conversation_id <> p_conversation_id
       or v_run.triggering_message_id is distinct from p_triggering_message_id
       or v_run.quality <> p_quality
       or v_run.model is distinct from p_model
       or v_run.prompt_version <> p_prompt_version then
      raise exception 'Assistant request id was reused with different input' using errcode = '23505';
    end if;
  end if;
  return v_run;
end;
$$;

revoke all on function public.create_assistant_run(text, uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_assistant_run(text, uuid, uuid, uuid, text, text, text, text) to service_role;

create or replace function public.append_assistant_message(
  p_user_id text,
  p_conversation_id uuid,
  p_message_id uuid,
  p_role text,
  p_parts jsonb,
  p_status text default 'completed',
  p_parent_message_id uuid default null
)
returns public.assistant_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence integer;
  v_message public.assistant_messages;
begin
  if p_role not in ('user', 'assistant', 'tool')
     or p_status not in ('pending', 'streaming', 'completed', 'failed', 'cancelled')
     or jsonb_typeof(p_parts) <> 'array' then
    raise exception 'Invalid assistant message' using errcode = '22023';
  end if;

  perform 1 from public.assistant_conversations
    where id = p_conversation_id and user_id = p_user_id
    for update;
  if not found then raise exception 'Assistant conversation not found' using errcode = 'P0002'; end if;

  if p_parent_message_id is not null and not exists (
    select 1 from public.assistant_messages
    where id = p_parent_message_id and user_id = p_user_id and conversation_id = p_conversation_id
  ) then
    raise exception 'Assistant parent message not found' using errcode = '23503';
  end if;

  select coalesce(max(sequence), 0) + 1 into v_sequence
  from public.assistant_messages where conversation_id = p_conversation_id;

  insert into public.assistant_messages (id, user_id, conversation_id, sequence, role, parts, status, parent_message_id)
  values (p_message_id, p_user_id, p_conversation_id, v_sequence, p_role, p_parts, p_status, p_parent_message_id)
  returning * into v_message;

  update public.assistant_conversations set updated_at = now() where id = p_conversation_id and user_id = p_user_id;
  return v_message;
end;
$$;

revoke all on function public.append_assistant_message(text, uuid, uuid, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.append_assistant_message(text, uuid, uuid, text, jsonb, text, uuid) to service_role;

create or replace function public.confirm_assistant_memory(
  p_user_id text,
  p_memory_id uuid,
  p_confirmation_message_id uuid
)
returns public.assistant_memories
language plpgsql
security definer
set search_path = ''
as $$
declare v_memory public.assistant_memories;
begin
  if not exists (
    select 1 from public.assistant_messages
    where id = p_confirmation_message_id and user_id = p_user_id and role = 'user'
  ) then raise exception 'Confirmation message not found' using errcode = '23503'; end if;

  select * into v_memory from public.assistant_memories
    where id = p_memory_id and user_id = p_user_id and status = 'confirmed';
  if found then return v_memory; end if;

  update public.assistant_memories set
    status = 'confirmed', confirmed_by_message_id = p_confirmation_message_id,
    confirmed_at = now(), updated_at = now()
  where id = p_memory_id and user_id = p_user_id and status = 'proposed'
  returning * into v_memory;
  if not found then raise exception 'Proposed memory not found' using errcode = 'P0002'; end if;
  return v_memory;
end;
$$;

revoke all on function public.confirm_assistant_memory(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_assistant_memory(text, uuid, uuid) to service_role;

create or replace function public.confirm_assistant_goal_set(
  p_user_id text,
  p_goal_set_id uuid,
  p_confirmation_message_id uuid
)
returns public.assistant_goal_sets
language plpgsql
security definer
set search_path = ''
as $$
declare v_goal_set public.assistant_goal_sets;
begin
  if not exists (
    select 1 from public.assistant_messages
    where id = p_confirmation_message_id and user_id = p_user_id and role = 'user'
  ) then raise exception 'Confirmation message not found' using errcode = '23503'; end if;

  select * into v_goal_set from public.assistant_goal_sets
    where id = p_goal_set_id and user_id = p_user_id and status = 'confirmed';
  if found then return v_goal_set; end if;

  perform 1 from public.assistant_goal_sets where user_id = p_user_id for update;
  update public.assistant_goal_sets set status = 'archived', updated_at = now()
    where user_id = p_user_id and status = 'confirmed' and id <> p_goal_set_id;
  update public.assistant_goal_sets set
    status = 'confirmed', confirmed_by_message_id = p_confirmation_message_id,
    confirmed_at = now(), updated_at = now()
  where id = p_goal_set_id and user_id = p_user_id and status = 'draft'
  returning * into v_goal_set;
  if not found then raise exception 'Draft goal set not found' using errcode = 'P0002'; end if;
  return v_goal_set;
end;
$$;

revoke all on function public.confirm_assistant_goal_set(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_assistant_goal_set(text, uuid, uuid) to service_role;

create or replace function public.confirm_assistant_plan_version(
  p_user_id text,
  p_plan_version_id uuid,
  p_confirmation_message_id uuid
)
returns public.assistant_plan_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_version public.assistant_plan_versions;
begin
  if not exists (
    select 1 from public.assistant_messages
    where id = p_confirmation_message_id and user_id = p_user_id and role = 'user'
  ) then raise exception 'Confirmation message not found' using errcode = '23503'; end if;

  select * into v_version from public.assistant_plan_versions
    where id = p_plan_version_id and user_id = p_user_id and status = 'confirmed';
  if found then return v_version; end if;

  select plan_id into v_plan_id from public.assistant_plan_versions
    where id = p_plan_version_id and user_id = p_user_id and status = 'proposed'
    for update;
  if not found then raise exception 'Proposed plan version not found' using errcode = 'P0002'; end if;

  update public.assistant_plan_versions set status = 'superseded'
    where plan_id = v_plan_id and user_id = p_user_id and status = 'confirmed';
  update public.assistant_plan_versions set
    status = 'confirmed', confirmed_by_message_id = p_confirmation_message_id, confirmed_at = now()
    where id = p_plan_version_id and user_id = p_user_id
    returning * into v_version;
  update public.assistant_plans set status = 'active', updated_at = now()
    where id = v_plan_id and user_id = p_user_id;
  return v_version;
end;
$$;

revoke all on function public.confirm_assistant_plan_version(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_assistant_plan_version(text, uuid, uuid) to service_role;
