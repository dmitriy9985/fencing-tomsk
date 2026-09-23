-- Blocking production verification after results-structured-data.sql and
-- seed-existing-structured-results.sql.
-- Read-only: any mismatch raises an exception.

do $verification$
declare
  actual_count integer;
  expected_count bigint;
  mismatch_count integer;
begin
  if to_regclass(
    'private_backups.competition_results_pre_structured_20260923'
  ) is null then
    raise exception 'The pre-migration production results snapshot is missing';
  end if;

  if to_regclass(
    'private_backups.results_release_manifest_20260923'
  ) is null then
    raise exception 'The pre-migration production release manifest is missing';
  end if;

  select count(*)
  into actual_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'competition_results'
    and column_name in ('event_id', 'news_id', 'city', 'protocol_url');
  if actual_count <> 4 then
    raise exception
      'Expected 4 structured competition_results columns, found %',
      actual_count;
  end if;

  if to_regclass('public.competition_result_entries') is null then
    raise exception 'competition_result_entries was not created';
  end if;

  select row_count
  into expected_count
  from private_backups.results_release_manifest_20260923
  where relation_name = 'public.competition_results';
  select count(*) into actual_count from public.competition_results;
  if actual_count <> expected_count then
    raise exception
      'competition_results count changed: expected %, found %',
      expected_count,
      actual_count;
  end if;

  select count(*)
  into mismatch_count
  from private_backups.competition_results_pre_structured_20260923 as backup
  left join public.competition_results as actual on actual.id = backup.id
  where actual.id is null
     or actual.competition_date is distinct from backup.competition_date
     or actual.date_label is distinct from backup.date_label
     or actual.title is distinct from backup.title
     or actual.result_text is distinct from backup.result_text
     or actual.category is distinct from backup.category
     or actual.published is distinct from backup.published
     or actual.created_at is distinct from backup.created_at;
  if mismatch_count <> 0 then
    raise exception
      '% legacy competition_results rows were changed or lost',
      mismatch_count;
  end if;

  select count(*) into actual_count
  from public.competition_results
  where news_id is not null;
  if actual_count <> 3 then
    raise exception 'Expected 3 result-to-news links, found %', actual_count;
  end if;

  select count(*) into actual_count
  from public.competition_result_entries;
  if actual_count <> 8 then
    raise exception 'Expected 8 structured result entries, found %', actual_count;
  end if;

  select count(*)
  into mismatch_count
  from (
    select
      competition_result_id,
      place,
      participant_name,
      weapon,
      age_category,
      competition_format
    from public.competition_result_entries
    group by
      competition_result_id,
      place,
      participant_name,
      weapon,
      age_category,
      competition_format
    having count(*) > 1
  ) as duplicates;
  if mismatch_count <> 0 then
    raise exception 'Structured seed created % duplicate groups', mismatch_count;
  end if;

  with expected (title, expected_count) as (
    values
      ('Турнир на призы Любови Шутовой'::text, 3),
      ('Первенство Томской области'::text, 4),
      ('Кубок Легенд Республики Башкортостан'::text, 1)
  ), actual as (
    select result.title, count(entry.id)::integer as entries_count
    from public.competition_results as result
    left join public.competition_result_entries as entry
      on entry.competition_result_id = result.id
    group by result.id, result.title
  )
  select count(*)
  into mismatch_count
  from expected
  left join actual using (title)
  where actual.entries_count is distinct from expected.expected_count;
  if mismatch_count <> 0 then
    raise exception
      '% tournaments have an unexpected structured entry count',
      mismatch_count;
  end if;

  select count(*)
  into actual_count
  from pg_class
  where oid in (
    'public.competition_results'::regclass,
    'public.competition_result_entries'::regclass
  )
    and relrowsecurity = true;
  if actual_count <> 2 then
    raise exception 'RLS is not enabled on both result tables';
  end if;

  select count(*)
  into actual_count
  from pg_policies
  where schemaname = 'public'
    and (
      (
        tablename = 'competition_results'
        and policyname in (
          'Visitors can read published competition results',
          'Admins can manage competition results'
        )
      )
      or
      (
        tablename = 'competition_result_entries'
        and policyname in (
          'Visitors can read entries from published results',
          'Admins can manage competition result entries'
        )
      )
    );
  if actual_count <> 4 then
    raise exception 'Expected 4 result RLS policies, found %', actual_count;
  end if;

  select count(*)
  into actual_count
  from pg_constraint
  where conrelid = 'public.competition_results'::regclass
    and conname in (
      'competition_results_event_id_fkey',
      'competition_results_news_id_fkey'
    );
  if actual_count <> 2 then
    raise exception 'Expected 2 result foreign keys, found %', actual_count;
  end if;

  select row_count into expected_count
  from private_backups.results_release_manifest_20260923
  where relation_name = 'public.news';
  select count(*) into actual_count from public.news;
  if actual_count <> expected_count then
    raise exception
      'public.news count changed: expected %, found %',
      expected_count,
      actual_count;
  end if;

  select row_count into expected_count
  from private_backups.results_release_manifest_20260923
  where relation_name = 'public.competition_events';
  select count(*) into actual_count from public.competition_events;
  if actual_count <> expected_count then
    raise exception
      'public.competition_events count changed: expected %, found %',
      expected_count,
      actual_count;
  end if;

  select row_count into expected_count
  from private_backups.results_release_manifest_20260923
  where relation_name = 'public.gallery_albums';
  select count(*) into actual_count from public.gallery_albums;
  if actual_count <> expected_count then
    raise exception
      'public.gallery_albums count changed: expected %, found %',
      expected_count,
      actual_count;
  end if;

  select row_count into expected_count
  from private_backups.results_release_manifest_20260923
  where relation_name = 'public.gallery_photos';
  select count(*) into actual_count from public.gallery_photos;
  if actual_count <> expected_count then
    raise exception
      'public.gallery_photos count changed: expected %, found %',
      expected_count,
      actual_count;
  end if;

  select row_count into expected_count
  from private_backups.results_release_manifest_20260923
  where relation_name = 'public.home_content';
  select count(*) into actual_count from public.home_content;
  if actual_count <> expected_count then
    raise exception
      'public.home_content count changed: expected %, found %',
      expected_count,
      actual_count;
  end if;
end;
$verification$;

select
  'PASS'::text as status,
  (select count(*) from public.competition_results) as competition_results,
  (select count(*) from public.competition_result_entries) as structured_entries,
  (
    select count(*)
    from public.competition_results
    where nullif(btrim(result_text), '') is not null
  ) as preserved_result_texts,
  (
    select count(*)
    from public.competition_results
    where news_id is not null
  ) as linked_news,
  (
    select count(*)
    from pg_class
    where oid in (
      'public.competition_results'::regclass,
      'public.competition_result_entries'::regclass
    )
      and relrowsecurity = true
  ) as rls_enabled_tables;
