alter table public.careline_patients add column gender text check (gender is null or length(gender)<=60);
grant insert(gender), update(gender) on public.careline_patients to authenticated;
