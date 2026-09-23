-- Run only against a disposable PostgreSQL database after the Soma migrations.
begin;

insert into public.soma_users (id, google_subject, display_name, created_at, updated_at)
values ('synthetic-nutrition-smoke', 'synthetic-nutrition-smoke', 'Synthetic', now(), now());

insert into public.assistant_conversations (id, user_id)
values ('00000000-0000-4000-8000-000000000301', 'synthetic-nutrition-smoke');

insert into public.assistant_messages (id, user_id, conversation_id, sequence, role)
values ('00000000-0000-4000-8000-000000000302', 'synthetic-nutrition-smoke',
  '00000000-0000-4000-8000-000000000301', 1, 'user');

insert into public.soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at)
values ('nutrition_targets', 'synthetic-nutrition-key', 'synthetic-nutrition-smoke',
  '{"user_id":"synthetic-nutrition-smoke","targets":{"proteinG":{"likely":100}}}'::jsonb, now(), now());

insert into public.assistant_actions
  (id, user_id, conversation_id, action_type, state, payload, idempotency_key)
values ('00000000-0000-4000-8000-000000000303', 'synthetic-nutrition-smoke',
  '00000000-0000-4000-8000-000000000301', 'nutrition_targets.update', 'proposed',
  '{"persisted":true,"rawBefore":{"proteinG":{"likely":100}},"after":{"proteinG":{"likely":120}}}'::jsonb,
  'synthetic-nutrition-1');

do $$
declare v_result jsonb;
begin
  v_result := public.confirm_assistant_nutrition_targets('synthetic-nutrition-smoke',
    '00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000302', 'synthetic-nutrition-key');
  if v_result->>'saved' <> 'true' or v_result->>'replayed' <> 'false' then
    raise exception 'First confirmation failed';
  end if;
  v_result := public.confirm_assistant_nutrition_targets('synthetic-nutrition-smoke',
    '00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000302', 'synthetic-nutrition-key');
  if v_result->>'saved' <> 'true' or v_result->>'replayed' <> 'true' then
    raise exception 'Idempotent replay failed';
  end if;
end;
$$;

-- Another interface may subsequently change the target. A replay must not
-- claim that the original target is still saved.
select public.save_soma_nutrition_targets('synthetic-nutrition-smoke',
  'synthetic-nutrition-key', '{"proteinG":{"likely":140}}'::jsonb);

do $$
begin
  begin
    perform public.save_soma_nutrition_targets('synthetic-nutrition-smoke',
      'synthetic-nutrition-key', null);
    raise exception 'Null target was accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

do $$
declare v_result jsonb;
begin
  v_result := public.confirm_assistant_nutrition_targets('synthetic-nutrition-smoke',
    '00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000302', 'synthetic-nutrition-key');
  if v_result->>'saved' <> 'false' or v_result->'targets' <> '{"proteinG":{"likely":140}}'::jsonb then
    raise exception 'Replay hid a later edit';
  end if;
end;
$$;

insert into public.assistant_actions
  (id, user_id, conversation_id, action_type, state, payload, idempotency_key)
values ('00000000-0000-4000-8000-000000000304', 'synthetic-nutrition-smoke',
  '00000000-0000-4000-8000-000000000301', 'nutrition_targets.update', 'proposed',
  '{"persisted":true,"rawBefore":{"proteinG":{"likely":120}},"after":{"proteinG":{"likely":150}}}'::jsonb,
  'synthetic-nutrition-2');

do $$
begin
  begin
    perform public.confirm_assistant_nutrition_targets('synthetic-nutrition-smoke',
      '00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000302', 'synthetic-nutrition-key');
    raise exception 'Stale proposal was accepted';
  exception when sqlstate '40001' then null;
  end;
  if (select state from public.assistant_actions where id = '00000000-0000-4000-8000-000000000304') <> 'proposed'
     or (select json_data->'targets' from public.soma_rows where table_name = 'nutrition_targets'
       and row_key = 'synthetic-nutrition-key') <> '{"proteinG":{"likely":140}}'::jsonb then
    raise exception 'Stale proposal changed persisted state';
  end if;
end;
$$;

-- First-time setup must create the canonical row and complete the action.
insert into public.assistant_actions
  (id, user_id, conversation_id, action_type, state, payload, idempotency_key)
values ('00000000-0000-4000-8000-000000000305', 'synthetic-nutrition-smoke',
  '00000000-0000-4000-8000-000000000301', 'nutrition_targets.update', 'proposed',
  '{"persisted":false,"before":{"proteinG":{"likely":100}},"after":{"proteinG":{"likely":130}}}'::jsonb,
  'synthetic-nutrition-3');

do $$
declare v_result jsonb;
begin
  v_result := public.confirm_assistant_nutrition_targets('synthetic-nutrition-smoke',
    '00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000302', 'synthetic-nutrition-new');
  if v_result->>'saved' <> 'true'
     or (select json_data->'targets' from public.soma_rows where table_name = 'nutrition_targets'
       and row_key = 'synthetic-nutrition-new') <> '{"proteinG":{"likely":130}}'::jsonb then
    raise exception 'First-time target save failed';
  end if;
end;
$$;

rollback;
