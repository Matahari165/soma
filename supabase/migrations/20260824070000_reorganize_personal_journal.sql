-- Keep the daily journal chronological and reserve sleep timing for automatic wearable data.

update public.journal_variables
set is_active = false
where lower(name) in ('bedtime', 'heure du coucher');

with defaults(name, variable_type, unit, position) as (
  values
    ('Vacation', 'boolean', null, 0),
    ('Breakfast', 'boolean', null, 10),
    ('WHM rounds', 'count', 'rounds', 20),
    ('Caffeine', 'count', 'mg', 30),
    ('Deep Work', 'duration', 'min', 40),
    ('Added-sugar servings', 'count', 'servings', 50),
    ('Alcohol', 'count', 'drinks', 60),
    ('Dinner end time', 'time', null, 70),
    ('Magnesium', 'count', 'mg', 80),
    ('Breathing before sleep', 'boolean', null, 90),
    ('Reading before sleep', 'boolean', null, 100),
    ('Masturbation', 'boolean', null, 110),
    ('Dark bedroom', 'boolean', null, 120)
)
insert into public.journal_variables (user_id, name, variable_type, unit, options, position)
select users.id, defaults.name, defaults.variable_type, defaults.unit, '[]'::jsonb, defaults.position
from auth.users as users
cross join defaults
on conflict (user_id, name) do nothing;

with positions(name, position) as (
  values
    ('Vacation', 0),
    ('Breakfast', 10),
    ('WHM rounds', 20),
    ('Caffeine', 30),
    ('Deep Work', 40),
    ('Added-sugar servings', 50),
    ('Alcohol', 60),
    ('Dinner end time', 70),
    ('Magnesium', 80),
    ('Breathing before sleep', 90),
    ('Reading before sleep', 100),
    ('Masturbation', 110),
    ('Dark bedroom', 120)
)
update public.journal_variables as variable
set position = positions.position
from positions
where variable.name = positions.name;

