-- Apply this migration before publishing the admin that calls the RPC.
begin;

create or replace function public.save_competition_result(
  p_id bigint,
  p_expected_updated_at timestamptz,
  p_result jsonb,
  p_entries jsonb,
  p_removed_ids bigint[]
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent public.competition_results%rowtype;
  entry public.competition_result_entries%rowtype;
  data jsonb;
  result_id bigint;
  changed bigint;
begin
  if not exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into parent from pg_catalog.jsonb_populate_record(null::public.competition_results, p_result);
  if p_id is null then
    insert into public.competition_results (
      competition_date, date_label, title, city, category, event_id, news_id,
      protocol_url, result_text, other_participants, published
    ) values (
      parent.competition_date, parent.date_label, parent.title, parent.city, parent.category,
      parent.event_id, parent.news_id, parent.protocol_url, parent.result_text,
      parent.other_participants, parent.published
    ) returning id into result_id;
  else
    update public.competition_results set
      competition_date = parent.competition_date, date_label = parent.date_label, title = parent.title,
      city = parent.city, category = parent.category, event_id = parent.event_id, news_id = parent.news_id,
      protocol_url = parent.protocol_url, result_text = parent.result_text,
      other_participants = parent.other_participants, published = parent.published
    where id = p_id and updated_at = p_expected_updated_at
    returning id into result_id;
    if not found then
      raise exception 'RESULT_CHANGED' using errcode = 'PT409';
    end if;
  end if;

  for data in select value from pg_catalog.jsonb_array_elements(p_entries)
  loop
    select * into entry from pg_catalog.jsonb_populate_record(null::public.competition_result_entries, data);
    if entry.id is null then
      insert into public.competition_result_entries (
        competition_result_id, place, participant_name, weapon, age_category,
        competition_format, team_members, sort_order
      ) values (
        result_id, entry.place, entry.participant_name, entry.weapon, entry.age_category,
        entry.competition_format, entry.team_members, entry.sort_order
      );
    else
      update public.competition_result_entries set
        place = entry.place, participant_name = entry.participant_name, weapon = entry.weapon,
        age_category = entry.age_category, competition_format = entry.competition_format,
        team_members = entry.team_members, sort_order = entry.sort_order
      where id = entry.id and competition_result_id = result_id;
      if not found then
        raise exception 'RESULT_CHANGED' using errcode = 'PT409';
      end if;
    end if;
  end loop;

  if cardinality(p_removed_ids) > 0 then
    delete from public.competition_result_entries
    where competition_result_id = result_id and id = any(p_removed_ids);
    get diagnostics changed = row_count;
    if changed <> cardinality(p_removed_ids) then
      raise exception 'RESULT_CHANGED' using errcode = 'PT409';
    end if;
  end if;

  return result_id;
end;
$$;

revoke all on function public.save_competition_result(bigint, timestamptz, jsonb, jsonb, bigint[])
  from public, anon, authenticated;
grant execute on function public.save_competition_result(bigint, timestamptz, jsonb, jsonb, bigint[])
  to authenticated;

notify pgrst, 'reload schema';

commit;
