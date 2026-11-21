-- Одно атомарное расширение. Существующие турниры получают NULL в новых полях.
-- Ограничения времени и парных полей проверяются при каждой записи.
begin;

set local lock_timeout = '3s';

alter table public.competition_events
  add column start_time time(0),
  add column meeting_time time(0),
  add column time_zone varchar(80),
  add column organizer_contact varchar(300),
  add column regulation_url varchar(2048) check (regulation_url ~ '^https://[^[:space:]]+$'),
  add column document_title varchar(150),
  add column document_url varchar(2048) check (document_url ~ '^https://[^[:space:]]+$'),
  add constraint competition_events_document_pair check (
    (document_url is null) = (document_title is null) and length(trim(document_title)) > 0
  ),
  add constraint competition_events_times_zone check (
    (start_time is null and meeting_time is null) = (time_zone is null)
    and length(trim(time_zone)) > 0
  );

notify pgrst, 'reload schema';

commit;
