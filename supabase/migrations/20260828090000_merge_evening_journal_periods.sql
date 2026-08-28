update public.journal_variables
set day_period = 'evening'
where day_period = 'sleep';

update public.journal_variables
set day_period = 'morning'
where lower(name) = 'magnesium';
