-- Поддержка точных, помесячных и ориентировочных дат календаря.
--
-- Выполняйте файл целиком в Supabase Dashboard -> SQL Editor.
-- Миграция идемпотентна и не меняет RLS-политики или другие таблицы.

begin;

alter table public.competition_events
  add column if not exists date_precision text not null default 'exact';

-- Защита для повторного запуска после частично выполненной миграции.
update public.competition_events
set date_precision = 'exact'
where date_precision is null;

alter table public.competition_events
  alter column date_precision set default 'exact',
  alter column date_precision set not null,
  add column if not exists date_month smallint,
  add column if not exists date_year smallint;

-- Для month дата хранится только в date_month/date_year. Конкретный день
-- намеренно отсутствует, поэтому start_date должен допускать NULL.
alter table public.competition_events
  alter column start_date drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.competition_events'::regclass
      and conname = 'competition_events_date_precision_check'
  ) then
    alter table public.competition_events
      add constraint competition_events_date_precision_check
      check (date_precision in ('exact', 'month', 'approximate'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.competition_events'::regclass
      and conname = 'competition_events_date_fields_check'
  ) then
    alter table public.competition_events
      add constraint competition_events_date_fields_check
      check (
        (
          date_precision in ('exact', 'approximate')
          and start_date is not null
          and date_month is null
          and date_year is null
        )
        or
        (
          date_precision = 'month'
          and start_date is null
          and end_date is null
          and date_month between 1 and 12
          and date_year between 2000 and 2100
        )
      );
  end if;
end;
$$;

-- sort_date нужен только для хронологической сортировки. Для события без
-- точного дня используется середина месяца; это значение никогда не должно
-- выводиться как фактическая дата соревнования.
alter table public.competition_events
  add column if not exists sort_date date generated always as (
    case
      when date_precision = 'month'
        then make_date(date_year::integer, date_month::integer, 15)
      else start_date
    end
  ) stored;

create index if not exists competition_events_public_sort_idx
  on public.competition_events (published, sort_date, created_at desc);

-- Текущий лимит 12 символов не допускает согласованные метки календаря.
alter table public.competition_events
  drop constraint if exists competition_events_short_label_check;
alter table public.competition_events
  drop constraint if exists competition_events_short_label_length_check;
alter table public.competition_events
  add constraint competition_events_short_label_length_check
  check (char_length(short_label) <= 40) not valid;
alter table public.competition_events
  validate constraint competition_events_short_label_length_check;

comment on column public.competition_events.date_precision is
  'Тип даты: exact, month или approximate.';
comment on column public.competition_events.date_month is
  'Месяц 1-12 только для date_precision=month.';
comment on column public.competition_events.date_year is
  'Год только для date_precision=month.';
comment on column public.competition_events.sort_date is
  'Внутренняя дата сортировки; не является публичной датой события.';

commit;
