-- Apply before deploying the results page and admin editors.
alter table public.competition_results
  add column if not exists other_participants text;
