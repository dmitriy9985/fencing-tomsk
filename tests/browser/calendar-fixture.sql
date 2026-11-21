create role anon;
create role authenticated;
create schema auth;
grant usage on schema auth to authenticated;
create function auth.uid() returns uuid language sql as
$$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
create table auth.users (id uuid primary key);
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (bucket_id text);
insert into auth.users values ('00000000-0000-4000-8000-000000000001');

\ir ../../supabase/setup.sql
\ir ../../supabase/site-admin-extension.sql
\ir ../../supabase/results-structured-data.sql
\ir ../../supabase/results-other-participants.sql
\ir ../../supabase/calendar-flexible-dates.sql
\ir ../../supabase/calendar-event-details.sql
\ir ../../supabase/calendar-participants.sql

insert into admin_users(user_id) values ('00000000-0000-4000-8000-000000000001');
insert into competition_events (id,title,start_date,published,location,category_label,description) values
 (8,'Первенство Сибирского федерального округа среди юниоров','2026-11-28',true,'Новосибирск, ул. Гаранина, 2','Первенство СФО','Подробное положение'),
 (9,'Всероссийские соревнования «Мастерский»','2026-12-14',true,'Новосибирск','Всероссийские соревнования','Среди взрослых'),
 (10,'Чемпионат г. Томска','2026-12-06',true,'Томск','Чемпионат','Среди взрослых'),
 (11,'Турнир «Юный мушкетер»','2026-12-19',true,'Томск','Турнир','2012–2017 г.р.'),
 (12,'Тестовый черновик','2026-12-20',false,'Томск','Турнир','Черновик'),
 (101,'Турнир без меток','2026-12-25',true,'Томск','Турнир','');
\ir ../../supabase/calendar-participants-2026-11.sql

-- Keep the fixture in the upcoming list on future test runs.
update competition_events set start_date = start_date + (current_date - date '2026-11-22');
