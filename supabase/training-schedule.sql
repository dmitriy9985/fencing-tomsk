-- Stage 1. Apply only after approval. Requires the existing public.admin_users table.
begin;

create table public.training_slots (
  id text primary key,
  weekdays smallint[] not null check (cardinality(weekdays) > 0 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  starts_at time(0) not null,
  ends_at time(0) not null check (ends_at > starts_at and ends_at < time '24:00')
);

insert into public.training_slots (id, weekdays, starts_at, ends_at) values
  ('morning-1', '{1,2,3,4,5}', '08:00', '09:15'),
  ('morning-2', '{1,2,3,4,5}', '09:00', '10:30'),
  ('afternoon', '{1,2,3,4,5}', '15:00', '16:30'),
  ('monday-evening', '{1}', '16:30', '18:30'),
  ('evening', '{2,3,4,5}', '17:00', '19:00');

create table public.training_exceptions (
  slot_id text not null references public.training_slots(id),
  original_date date not null,
  status text not null check (status in ('cancelled', 'moved', 'regular')),
  moved_date date,
  moved_time time(0),
  reason text check (length(reason) <= 200),
  revision integer not null check (revision > 0),
  primary key (slot_id, original_date),
  check ((moved_date is null) = (moved_time is null)),
  check (status <> 'moved' or moved_date is not null),
  check (status <> 'regular' or (moved_date is null and reason is null))
);

create index training_exceptions_original_idx on public.training_exceptions (original_date);
create index training_exceptions_moved_idx on public.training_exceptions (moved_date) where moved_date is not null;

alter table public.training_slots enable row level security;
alter table public.training_exceptions enable row level security;
revoke all on public.training_slots, public.training_exceptions from public, anon, authenticated;
grant select on public.training_slots, public.training_exceptions to anon, authenticated;
create policy training_slots_read on public.training_slots for select to anon, authenticated using (true);
create policy training_exceptions_read on public.training_exceptions for select to anon, authenticated using (true);

create schema ffto_training_private;
revoke all on schema ffto_training_private from public, anon, authenticated;
grant usage on schema ffto_training_private to authenticated;

create function ffto_training_private.change_training(
  p_slot_id text, p_original_date date, p_status text, p_revision integer,
  p_moved_date date, p_moved_time time, p_reason text
) returns public.training_exceptions
language plpgsql security definer set search_path = ''
as $$
declare
  slot public.training_slots%rowtype;
  previous public.training_exceptions%rowtype;
  saved public.training_exceptions%rowtype;
  local_now timestamp;
  original_start timestamp;
  previous_start timestamp;
  target_start timestamp;
  duration interval;
  reason_text text := nullif(pg_catalog.btrim(p_reason), '');
begin
  if not exists (select 1 from public.admin_users where user_id = (select auth.uid())) then
    raise insufficient_privilege using message = 'У этой учётной записи нет доступа к управлению тренировками.';
  end if;
  if p_status is null or p_status not in ('cancelled', 'moved', 'regular')
    or p_revision is null or p_revision < 0 or length(reason_text) > 200
    or p_original_date is null or not pg_catalog.isfinite(p_original_date) then
    raise invalid_parameter_value using message = 'Проверьте дату, действие и длину причины.';
  end if;
  select * into slot from public.training_slots where id = p_slot_id;
  if not found or not (extract(isodow from p_original_date) = any(slot.weekdays)) then
    raise invalid_parameter_value using message = 'На исходную дату такого занятия нет.';
  end if;

  -- Serialize edits to occurrences of the same slot, including moves to the same day.
  perform pg_catalog.pg_advisory_xact_lock(17127031, pg_catalog.hashtext(p_slot_id));
  local_now := pg_catalog.timezone('Asia/Tomsk', pg_catalog.clock_timestamp());
  select * into previous from public.training_exceptions
  where slot_id = p_slot_id and original_date = p_original_date;
  if coalesce(previous.revision, 0) <> p_revision then
    raise serialization_failure using message = 'Расписание уже изменилось. Обновите список и повторите действие.';
  end if;
  original_start := p_original_date + slot.starts_at;
  previous_start := coalesce(previous.moved_date + previous.moved_time, original_start);
  duration := slot.ends_at - slot.starts_at;
  if previous_start <= local_now then
    raise invalid_parameter_value using message = 'Время занятия уже прошло.';
  end if;

  if p_status = 'moved' then
    if p_moved_date is null or not pg_catalog.isfinite(p_moved_date) or p_moved_time is null
      or p_moved_time >= time '24:00' or extract(second from p_moved_time) <> 0 then
      raise invalid_parameter_value using message = 'Укажите новую дату и время с точностью до минуты.';
    end if;
    target_start := p_moved_date + p_moved_time;
    if target_start = original_start then
      raise invalid_parameter_value using message = 'Это исходное время. Используйте «Вернуть по расписанию».';
    end if;
  elsif p_status = 'regular' then
    target_start := original_start;
    p_moved_date := null;
    p_moved_time := null;
    reason_text := null;
  else
    p_moved_date := previous.moved_date;
    p_moved_time := previous.moved_time;
  end if;

  if (coalesce(previous.status, 'regular'), previous.moved_date, previous.moved_time, previous.reason)
      is not distinct from (p_status, p_moved_date, p_moved_time, reason_text) then
    raise invalid_parameter_value using message = 'Это изменение уже сохранено.';
  end if;

  if target_start is not null then
    if target_start <= local_now then
      raise invalid_parameter_value using message = 'Укажите будущее время.';
    end if;
    if exists (
      select 1 from (
        select day::date + slot.starts_at as start_time
        from pg_catalog.generate_series(
          (target_start::date - 1)::timestamp, (target_start::date + 1)::timestamp, interval '1 day'
        ) as dates(day)
        where extract(isodow from day) = any(slot.weekdays) and day::date <> p_original_date
          and not exists (
            select 1 from public.training_exceptions e
            where e.slot_id = p_slot_id and e.original_date = day::date and e.status <> 'regular'
          )
        union all
        select e.moved_date + e.moved_time from public.training_exceptions e
        where e.slot_id = p_slot_id and e.original_date <> p_original_date and e.status = 'moved'
          and e.moved_date between target_start::date - 1 and target_start::date + 1
      ) as other
      where other.start_time < target_start + duration and other.start_time + duration > target_start
    ) then
      raise invalid_parameter_value using message = 'Занятие пересекается с другим занятием того же слота.';
    end if;
  end if;

  insert into public.training_exceptions (slot_id, original_date, status, moved_date, moved_time, reason, revision)
  values (p_slot_id, p_original_date, p_status, p_moved_date, p_moved_time, reason_text, p_revision + 1)
  on conflict (slot_id, original_date) do update set
    status = excluded.status, moved_date = excluded.moved_date, moved_time = excluded.moved_time,
    reason = excluded.reason, revision = excluded.revision
  returning * into saved;
  return saved;
end;
$$;

create function public.change_training(
  p_slot_id text, p_original_date date, p_status text, p_revision integer,
  p_moved_date date default null, p_moved_time time default null, p_reason text default null
) returns public.training_exceptions
language sql security invoker set search_path = ''
as $$
  select ffto_training_private.change_training(
    p_slot_id, p_original_date, p_status, p_revision, p_moved_date, p_moved_time, p_reason
  );
$$;

revoke all on function ffto_training_private.change_training(text,date,text,integer,date,time,text) from public, anon, authenticated;
revoke all on function public.change_training(text,date,text,integer,date,time,text) from public, anon, authenticated;
grant execute on function ffto_training_private.change_training(text,date,text,integer,date,time,text) to authenticated;
grant execute on function public.change_training(text,date,text,integer,date,time,text) to authenticated;

commit;
