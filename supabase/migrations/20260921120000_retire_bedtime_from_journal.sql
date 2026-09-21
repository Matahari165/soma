-- Sleep start is an outcome measured after the night, not a journal input.
-- Preserve historical entries while removing the automatic field from future journals.
update public.journal_variables
set is_active = false,
    updated_at = now()
where automatic_metric_id = 'bedtime'
  and is_active = true;
