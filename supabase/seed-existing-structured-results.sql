-- Однократный структурированный перенос трёх существующих результатов.
--
-- Запускайте после results-structured-data.sql. Повторный запуск безопасен:
-- записи ищутся по устойчивым полям турнира и результата. Неизвестные города,
-- составы команд и ссылки на протокол намеренно не заполняются.

begin;

-- Связи с существующими новостями добавляются только в пустое поле news_id.
-- С календарём старые результаты не связываются: подходящих событий тех же
-- дат в competition_events сейчас нет.
update public.competition_results as result
set news_id = news.id
from public.news as news
where result.news_id is null
  and result.title = 'Турнир на призы Любови Шутовой'
  and result.competition_date = '2026-05-17'::date
  and news.title = 'Томские фехтовальщики завоевали золото и две бронзы на турнире Любови Шутовой';

update public.competition_results as result
set news_id = news.id
from public.news as news
where result.news_id is null
  and result.title = 'Первенство Томской области'
  and result.competition_date = '2026-03-14'::date
  and news.title = 'Первенство Томской области: девушки';

update public.competition_results as result
set news_id = news.id
from public.news as news
where result.news_id is null
  and result.title = 'Кубок Легенд Республики Башкортостан'
  and result.competition_date = '2025-11-15'::date
  and news.title = 'Бронза на Кубке Легенд в Уфе';

with seeded_entries (
  result_title,
  result_date,
  place,
  participant_name,
  weapon,
  age_category,
  competition_format,
  team_members,
  sort_order
) as (
  values
    ('Турнир на призы Любови Шутовой'::text, '2026-05-17'::date, 1::smallint, 'Захар Пронин'::text, 'Шпага'::text, 'Юноши'::text, 'individual'::text, '{}'::text[], 0),
    ('Турнир на призы Любови Шутовой'::text, '2026-05-17'::date, 3::smallint, 'Родион Костырев'::text, 'Шпага'::text, 'Юноши'::text, 'individual'::text, '{}'::text[], 1),
    ('Турнир на призы Любови Шутовой'::text, '2026-05-17'::date, 3::smallint, 'Команда Томской области'::text, 'Шпага'::text, 'Юноши'::text, 'team'::text, '{}'::text[], 2),
    ('Первенство Томской области'::text, '2026-03-14'::date, 1::smallint, 'Алина Коренькова'::text, 'Шпага'::text, 'Девушки'::text, 'individual'::text, '{}'::text[], 0),
    ('Первенство Томской области'::text, '2026-03-14'::date, 2::smallint, 'Анна Мужецкая'::text, 'Шпага'::text, 'Девушки'::text, 'individual'::text, '{}'::text[], 1),
    ('Первенство Томской области'::text, '2026-03-14'::date, 3::smallint, 'Вера Бурлевич'::text, 'Шпага'::text, 'Девушки'::text, 'individual'::text, '{}'::text[], 2),
    ('Первенство Томской области'::text, '2026-03-14'::date, 3::smallint, 'Мария Терехина'::text, 'Шпага'::text, 'Девушки'::text, 'individual'::text, '{}'::text[], 3),
    ('Кубок Легенд Республики Башкортостан'::text, '2025-11-15'::date, 3::smallint, 'Команда Томской области'::text, 'Шпага'::text, 'Юноши'::text, 'team'::text, '{}'::text[], 0)
),
resolved as (
  select
    result.id as competition_result_id,
    seed.place,
    seed.participant_name,
    seed.weapon,
    seed.age_category,
    seed.competition_format,
    seed.team_members,
    seed.sort_order
  from seeded_entries as seed
  join public.competition_results as result
    on result.title = seed.result_title
   and result.competition_date = seed.result_date
)
insert into public.competition_result_entries (
  competition_result_id,
  place,
  participant_name,
  weapon,
  age_category,
  competition_format,
  team_members,
  sort_order
)
select
  seed.competition_result_id,
  seed.place,
  seed.participant_name,
  seed.weapon,
  seed.age_category,
  seed.competition_format,
  seed.team_members,
  seed.sort_order
from resolved as seed
where not exists (
  select 1
  from public.competition_result_entries as existing
  where existing.competition_result_id = seed.competition_result_id
    and existing.place = seed.place
    and existing.participant_name = seed.participant_name
    and existing.weapon = seed.weapon
    and existing.age_category = seed.age_category
    and existing.competition_format = seed.competition_format
);

commit;
