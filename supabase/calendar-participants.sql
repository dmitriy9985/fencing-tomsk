-- Add optional announcement metadata. Existing records and RLS are preserved.
begin;

alter table public.competition_events
  add column participant_groups jsonb not null default '[]'::jsonb
    check (
      case when jsonb_typeof(participant_groups) = 'array' then
        not jsonb_path_exists(participant_groups, 'lax $[*] ? (
          @.type() != "object" ||
          (!exists(@.label) && !exists(@.birth_years)) ||
          (exists(@.label) && (@.label.type() != "string" || !(@.label like_regex "^[^[:space:]].{0,63}$"))) ||
          (exists(@.birth_years) && (@.birth_years.type() != "string" || !(@.birth_years like_regex "^([0-9]{4} и (младше|старше)|[0-9]{4}(–[0-9]{4})?(, [0-9]{4}(–[0-9]{4})?)*)$")))
        )')
      else false end
    ),
  add column weapon_label text
    check (weapon_label is null or char_length(btrim(weapon_label)) between 1 and 40);

notify pgrst, 'reload schema';

commit;
