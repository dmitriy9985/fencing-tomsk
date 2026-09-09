-- Идемпотентное добавление календаря соревнований до конца 2026 года.
--
-- Сначала выполните supabase/calendar-flexible-dates.sql.
-- Файл обновляет совпавшие события по точному заголовку и добавляет только
-- отсутствующие. Другие записи public.competition_events не изменяются.

begin;

create temporary table calendar_2026_seed (
  title text primary key,
  start_date date,
  end_date date,
  date_precision text not null,
  date_month smallint,
  date_year smallint,
  location text not null,
  description text not null,
  category_label text not null,
  short_label text not null,
  published boolean not null,
  existing_id bigint
) on commit drop;

insert into calendar_2026_seed (
  title,
  start_date,
  end_date,
  date_precision,
  date_month,
  date_year,
  location,
  description,
  category_label,
  short_label,
  published
)
values
  (
    'Первенство Сибирского федерального округа',
    date '2026-09-19',
    date '2026-09-20',
    'exact',
    null,
    null,
    'Новосибирск',
    E'Шпага, кадеты 2010–2013 г.р. Личные и командные соревнования среди юношей и девушек.\n\n19 сентября — личные соревнования.\n20 сентября — командные соревнования.',
    'Первенство СФО',
    'СФО',
    true
  ),
  (
    'Всероссийский турнир «Золотая осень»',
    date '2026-10-08',
    date '2026-10-10',
    'exact',
    null,
    null,
    'Казань',
    E'Шпага, спортсмены 2011–2013 г.р.\n\n8–10 октября — соревнования по шпаге.',
    'Всероссийские соревнования',
    'Всероссийский турнир',
    true
  ),
  (
    'Межрегиональный турнир памяти ЗТР П.В. Слепцова',
    null,
    null,
    'month',
    10,
    2026,
    'Новосибирск',
    E'Соревнования среди спортсменов 2011–2013 г.р.\n\nТочная дата проведения будет уточнена позднее.',
    'Межрегиональные соревнования',
    'Межрегиональный турнир',
    true
  ),
  (
    'Межрегиональный турнир памяти ЗТ СССР П.А. Кондратенко',
    date '2026-11-15',
    date '2026-11-16',
    'exact',
    null,
    null,
    'Новосибирск',
    E'Шпага, спортсмены 2010–2013 г.р.\n\n15 ноября — личные соревнования.\n16 ноября — командные соревнования.',
    'Межрегиональные соревнования',
    'Межрегиональный турнир',
    true
  ),
  (
    'Всероссийский турнир «Кубок Легенд Республики Башкортостан»',
    date '2026-11-16',
    date '2026-11-19',
    'exact',
    null,
    null,
    'Уфа',
    E'Соревнования по шпаге среди детей до 15 лет и кадетов 2010–2013 г.р.\n\n16–17 ноября — соревнования среди детей до 15 лет.\n18–19 ноября — соревнования среди кадетов.',
    'Всероссийские соревнования',
    'Всероссийский турнир',
    true
  ),
  (
    'Первенство Сибирского федерального округа среди юниоров',
    date '2026-11-28',
    date '2026-11-29',
    'exact',
    null,
    null,
    'Новосибирск',
    E'Шпага, юниоры 2007–2013 г.р.\n\n28 ноября — личные соревнования.\n29 ноября — командные соревнования.',
    'Первенство СФО',
    'СФО',
    true
  ),
  (
    'Всероссийские соревнования «Мастерский»',
    date '2026-12-14',
    null,
    'exact',
    null,
    null,
    'Новосибирск',
    'Соревнования по шпаге среди взрослых.',
    'Всероссийские соревнования',
    'Всероссийские',
    true
  ),
  (
    'Чемпионат г. Томска',
    null,
    null,
    'month',
    12,
    2026,
    'Томск',
    E'Соревнования среди взрослых.\n\nТочная дата проведения будет уточнена позднее.',
    'Чемпионат',
    'Томск',
    true
  ),
  (
    'Турнир «Юный мушкетер»',
    date '2026-12-19',
    date '2026-12-20',
    'approximate',
    null,
    null,
    'Томск',
    E'Соревнования среди спортсменов 2012–2017 г.р.\n\nПредварительные даты проведения — 19–20 декабря 2026 года.\nДаты могут быть уточнены позднее.',
    'Турнир',
    'Томск',
    true
  );

lock table public.competition_events in share row exclusive mode;

-- Не делаем предположений при уже существующих дублях: вся транзакция
-- останавливается до UPDATE/INSERT и требует ручной проверки данных.
do $$
begin
  if exists (
    select events.title
    from public.competition_events as events
    join calendar_2026_seed as seed on seed.title = events.title
    group by events.title
    having count(*) > 1
  ) then
    raise exception
      'Найдены дубли календарных событий с заголовками из seed. Изменения отменены.';
  end if;
end;
$$;

update calendar_2026_seed as seed
set existing_id = events.id
from public.competition_events as events
where events.title = seed.title;

update public.competition_events as events
set
  start_date = seed.start_date,
  end_date = seed.end_date,
  date_precision = seed.date_precision,
  date_month = seed.date_month,
  date_year = seed.date_year,
  location = seed.location,
  description = seed.description,
  category_label = seed.category_label,
  short_label = seed.short_label,
  published = seed.published
from calendar_2026_seed as seed
where events.id = seed.existing_id;

insert into public.competition_events (
  title,
  start_date,
  end_date,
  date_precision,
  date_month,
  date_year,
  location,
  description,
  category_label,
  short_label,
  published
)
select
  seed.title,
  seed.start_date,
  seed.end_date,
  seed.date_precision,
  seed.date_month,
  seed.date_year,
  seed.location,
  seed.description,
  seed.category_label,
  seed.short_label,
  seed.published
from calendar_2026_seed as seed
where seed.existing_id is null;

-- Итог SQL Editor: на первом запуске для найденных строк будет UPDATE,
-- для отсутствующих — INSERT. На повторном запуске все строки будут UPDATE.
select
  case when seed.existing_id is null then 'INSERT' else 'UPDATE' end as action,
  seed.title,
  events.id,
  events.date_precision,
  events.sort_date,
  events.published
from calendar_2026_seed as seed
join public.competition_events as events on events.title = seed.title
order by events.sort_date, events.title;

commit;
