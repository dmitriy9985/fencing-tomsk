-- Run separately after the schema and production data update are approved.
-- Scope: the four published events verified on 22 November 2026.
begin;

with verified(id, title, start_date, groups, weapon) as (
  values
    (8, 'Первенство Сибирского федерального округа среди юниоров', date '2026-11-28',
      '[{"label":"Юниоры и юниорки","birth_years":"2007–2013"}]'::jsonb, 'Шпага'),
    (9, 'Всероссийские соревнования «Мастерский»', date '2026-12-14',
      '[{"label":"Мужчины и женщины"}]'::jsonb, 'Шпага'),
    (10, 'Чемпионат г. Томска', date '2026-12-06',
      '[{"label":"Взрослые"}]'::jsonb, null),
    (11, 'Турнир «Юный мушкетер»', date '2026-12-19',
      '[{"birth_years":"2012–2017"}]'::jsonb, null)
)
update public.competition_events event
set participant_groups = verified.groups, weapon_label = verified.weapon
from verified
where event.id = verified.id
  and event.title = verified.title
  and event.start_date = verified.start_date
  and event.published
  and event.participant_groups = '[]'::jsonb
  and event.weapon_label is null;

commit;
