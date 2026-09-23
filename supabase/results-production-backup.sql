-- Production safety snapshot before structured results migration.
-- Run once in the production Supabase SQL Editor before
-- results-structured-data.sql and seed-existing-structured-results.sql.
--
-- This snapshot is an additional fast rollback aid for the affected table.
-- It does not replace a full Supabase Dashboard or CLI database backup.

begin;

create schema if not exists private_backups;
revoke all on schema private_backups from public, anon, authenticated;

do $$
begin
  if to_regclass(
    'private_backups.competition_results_pre_structured_20260923'
  ) is not null then
    raise exception
      'Production results snapshot already exists; do not overwrite it';
  end if;

  if to_regclass(
    'private_backups.results_release_manifest_20260923'
  ) is not null then
    raise exception
      'Production results release manifest already exists; do not overwrite it';
  end if;
end;
$$;

create table private_backups.competition_results_pre_structured_20260923
as table public.competition_results;

create table private_backups.results_release_manifest_20260923 (
  captured_at timestamptz not null default now(),
  relation_name text primary key,
  row_count bigint not null
);

insert into private_backups.results_release_manifest_20260923
  (relation_name, row_count)
values
  ('public.competition_results', (select count(*) from public.competition_results)),
  ('public.news', (select count(*) from public.news)),
  ('public.competition_events', (select count(*) from public.competition_events)),
  ('public.gallery_albums', (select count(*) from public.gallery_albums)),
  ('public.gallery_photos', (select count(*) from public.gallery_photos)),
  ('public.home_content', (select count(*) from public.home_content));

revoke all
on all tables in schema private_backups
from public, anon, authenticated;

do $verification$
declare
  actual_count integer;
  mismatch_count integer;
begin
  select count(*)
  into actual_count
  from private_backups.competition_results_pre_structured_20260923;
  if actual_count <> 3 then
    raise exception
      'Expected exactly 3 production competition results before migration, found %',
      actual_count;
  end if;

  with expected (title, competition_date, result_text) as (
    values
      (
        'Турнир на призы Любови Шутовой'::text,
        '2026-05-17'::date,
        'Захар Пронин — 1 место, Родион Костырев — 3 место; команда Томской области — 3 место'::text
      ),
      (
        'Первенство Томской области'::text,
        '2026-03-14'::date,
        'Алина Коренькова — 1 место, Анна Мужецкая — 2 место, Вера Бурлевич и Мария Терехина — 3 место'::text
      ),
      (
        'Кубок Легенд Республики Башкортостан'::text,
        '2025-11-15'::date,
        'Команда Томской области — 3 место'::text
      )
  )
  select count(*)
  into mismatch_count
  from expected
  left join private_backups.competition_results_pre_structured_20260923 as actual
    on actual.title = expected.title
   and actual.competition_date = expected.competition_date
  where actual.id is null
     or actual.result_text is distinct from expected.result_text
     or actual.published is distinct from true;

  if mismatch_count <> 0 then
    raise exception
      '% expected production result rows do not match the pre-migration snapshot',
      mismatch_count;
  end if;
end;
$verification$;

commit;

select
  'BACKUP READY'::text as status,
  count(*) as competition_results,
  md5(
    string_agg(
      concat_ws(
        '|',
        id::text,
        competition_date::text,
        coalesce(date_label, ''),
        title,
        result_text,
        category,
        published::text,
        created_at::text,
        updated_at::text
      ),
      E'\n'
      order by id
    )
  ) as data_checksum
from private_backups.competition_results_pre_structured_20260923;
