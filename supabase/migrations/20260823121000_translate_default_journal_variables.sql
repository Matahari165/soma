update public.journal_variables as variable
set
  name = translation.new_name,
  unit = case
    when variable.name = 'Alcool' and variable.unit = 'verres' then 'drinks'
    when variable.name = 'Caféine' and variable.unit = 'prises' then 'servings'
    else variable.unit
  end
from (values
  ('Alcool', 'Alcohol'),
  ('Caféine', 'Caffeine'),
  ('Heure du coucher', 'Bedtime'),
  ('Vacances', 'Vacation'),
  ('Énergie', 'Energy'),
  ('Concentration', 'Focus')
) as translation(old_name, new_name)
where variable.name = translation.old_name
  and not exists (
    select 1
    from public.journal_variables as existing
    where existing.user_id = variable.user_id
      and existing.name = translation.new_name
  );
