-- Existing own-profile SELECT/UPDATE policies enforce ownership.
alter table public.careline_patients
  add column appearance text not null default 'system'
  check (appearance in ('system', 'light', 'dark'));
grant update (appearance) on public.careline_patients to authenticated;
