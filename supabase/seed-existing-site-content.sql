-- Однократный перенос фактического контента из публичного index.html.
--
-- Файл не изменяет news, admin_users, Storage buckets или RLS-политики.
-- Его можно безопасно запускать повторно: для записей без уникального
-- ограничения используются проверки по устойчивым естественным ключам.

begin;

-- ---------------------------------------------------------------------------
-- Календарь: 1 событие из секции #calendar.
-- Естественный ключ seed: title + start_date.
-- ---------------------------------------------------------------------------

with seed_events (
  title,
  start_date,
  end_date,
  location,
  description,
  category_label,
  short_label,
  published
) as (
  values (
    'Первенство России по фехтованию среди юношей и девушек 13–15 лет'::text,
    '2026-06-09'::date,
    '2026-06-12'::date,
    'Тольятти'::text,
    'Личные и командные соревнования на шпагах'::text,
    'Первенство России'::text,
    'ФР'::text,
    true
  )
)
insert into public.competition_events (
  title,
  start_date,
  end_date,
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
  seed.location,
  seed.description,
  seed.category_label,
  seed.short_label,
  seed.published
from seed_events as seed
where not exists (
  select 1
  from public.competition_events as existing
  where existing.title = seed.title
    and existing.start_date = seed.start_date
);

-- ---------------------------------------------------------------------------
-- Результаты: 3 строки из таблицы секции #results.
-- Для диапазона 15–18.11.2025 competition_date содержит первый день,
-- а исходная подпись диапазона полностью сохранена в date_label.
-- Естественный ключ seed: title + competition_date.
-- ---------------------------------------------------------------------------

with seed_results (
  competition_date,
  date_label,
  title,
  result_text,
  category,
  published
) as (
  values
    (
      '2026-05-17'::date,
      '17.05.2026'::text,
      'Турнир на призы Любови Шутовой'::text,
      'Захар Пронин — 1 место, Родион Костырев — 3 место; команда Томской области — 3 место'::text,
      'Юноши, шпага'::text,
      true
    ),
    (
      '2026-03-14'::date,
      '14.03.2026'::text,
      'Первенство Томской области'::text,
      'Алина Коренькова — 1 место, Анна Мужецкая — 2 место, Вера Бурлевич и Мария Терехина — 3 место'::text,
      'Девушки, шпага'::text,
      true
    ),
    (
      '2025-11-15'::date,
      '15–18.11.2025'::text,
      'Кубок Легенд Республики Башкортостан'::text,
      'Команда Томской области — 3 место'::text,
      'Юноши, командные соревнования, шпага'::text,
      true
    )
)
insert into public.competition_results (
  competition_date,
  date_label,
  title,
  result_text,
  category,
  published
)
select
  seed.competition_date,
  seed.date_label,
  seed.title,
  seed.result_text,
  seed.category,
  seed.published
from seed_results as seed
where not exists (
  select 1
  from public.competition_results as existing
  where existing.title = seed.title
    and existing.competition_date = seed.competition_date
);

-- ---------------------------------------------------------------------------
-- Галерея: текущая секция является одной плоской галереей с общим заголовком.
-- Поэтому создаётся один альбом «Фехтование в Томске» и 5 фотографий.
--
-- Файлы остаются в GitHub Pages. image_url содержит постоянный публичный URL,
-- а image_path намеренно равен NULL, чтобы админка не удаляла эти файлы из
-- Supabase Storage.
-- ---------------------------------------------------------------------------

insert into public.gallery_albums (
  title,
  description,
  event_date,
  published,
  sort_order
)
select
  'Фехтование в Томске',
  '',
  null,
  true,
  0
where not exists (
  select 1
  from public.gallery_albums as existing
  where existing.title = 'Фехтование в Томске'
);

with target_album as (
  select id
  from public.gallery_albums
  where title = 'Фехтование в Томске'
  order by id
  limit 1
),
seed_photos (image_url, caption, sort_order) as (
  values
    (
      'https://fencing-tomsk.ru/images/awards/tomsk2025/men.jpeg'::text,
      'Первенство Томской области 2026'::text,
      0
    ),
    (
      'https://fencing-tomsk.ru/images/awards/tomsk2025/womenu23.jpeg'::text,
      'Первенство Томской области 2026'::text,
      1
    ),
    (
      'https://fencing-tomsk.ru/images/awards/tomsk2025/women.jpeg'::text,
      'Первенство Томской области 2026'::text,
      2
    ),
    (
      'https://fencing-tomsk.ru/images/life/dayoftomsk2026.jpeg'::text,
      'День города Томска 2026'::text,
      3
    ),
    (
      'https://fencing-tomsk.ru/images/awards/shutova2026/shutova2026.jpeg'::text,
      'Турнир на призы Любови Шутовой'::text,
      4
    )
)
insert into public.gallery_photos (
  album_id,
  image_url,
  image_path,
  caption,
  alt_text,
  sort_order
)
select
  album.id,
  seed.image_url,
  null,
  seed.caption,
  '',
  seed.sort_order
from target_album as album
cross join seed_photos as seed
where not exists (
  select 1
  from public.gallery_photos as existing
  where existing.album_id = album.id
    and existing.image_url = seed.image_url
);

-- ---------------------------------------------------------------------------
-- Главная: singleton id = 1.
--
-- ON CONFLICT заполняет только пустые поля. Уже сохранённый вручную непустой
-- контент не перезаписывается. Hero-фон в index.html встроен как data: URI
-- длиной более 300 КБ и не соответствует ни одному файлу в images/, поэтому
-- hero_image_url и hero_image_path этим seed не изменяются.
-- ---------------------------------------------------------------------------

insert into public.home_content as existing (
  id,
  hero_kicker,
  hero_title,
  hero_subtitle,
  about_title,
  about_text
)
values (
  1,
  'Томская область • официальный сайт',
  'Фехтование в Томске',
  'Новости, календарь соревнований, результаты, тренеры и развитие фехтования в Томской области.',
  'Развиваем фехтование в регионе',
  'Федерация фехтования Томской области осуществляет развитие и популяризацию фехтования на территории региона. Федерация организует и проводит соревнования различного уровня, содействует подготовке спортсменов, развитию тренерского состава и участию томских фехтовальщиков во всероссийских и межрегиональных турнирах. На сайте публикуются новости, календарь соревнований, результаты выступлений спортсменов и официальная информация о деятельности федерации.'
)
on conflict (id) do update set
  hero_kicker = case
    when nullif(btrim(existing.hero_kicker), '') is null
      then excluded.hero_kicker
    else existing.hero_kicker
  end,
  hero_title = case
    when nullif(btrim(existing.hero_title), '') is null
      then excluded.hero_title
    else existing.hero_title
  end,
  hero_subtitle = case
    when nullif(btrim(existing.hero_subtitle), '') is null
      then excluded.hero_subtitle
    else existing.hero_subtitle
  end,
  about_title = case
    when nullif(btrim(existing.about_title), '') is null
      then excluded.about_title
    else existing.about_title
  end,
  about_text = case
    when nullif(btrim(existing.about_text), '') is null
      then excluded.about_text
    else existing.about_text
  end;

commit;
