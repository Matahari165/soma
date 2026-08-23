-- Keep starter journal measures objective and express caffeine in milligrams.

update public.journal_variables
set unit = 'mg'
where lower(name) in ('caffeine', 'caféine')
  and (unit is null or lower(unit) in ('servings', 'prises'));

update public.journal_variables
set is_active = false
where lower(name) in ('energy', 'focus', 'énergie', 'concentration');
