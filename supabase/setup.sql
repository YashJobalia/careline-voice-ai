-- CareLine portfolio demo. Run in a NEW Supabase project's SQL editor.
-- All names and appointments are fictional. Server-only access; no public RLS policies.
begin;

create table if not exists public.careline_departments (
  id text primary key,
  name text not null
);
create table if not exists public.careline_doctors (
  id text primary key,
  department_id text not null references public.careline_departments(id),
  name text not null,
  title text not null
);
create index if not exists careline_doctors_department_idx on public.careline_doctors(department_id);

create table if not exists public.careline_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id text not null references public.careline_doctors(id),
  starts_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes = 30),
  unique (doctor_id, starts_at)
);
create index if not exists careline_slots_starts_at_idx on public.careline_slots(starts_at);

create table if not exists public.careline_appointments (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null unique references public.careline_slots(id),
  session_id uuid not null,
  patient_name text not null check (char_length(patient_name) between 2 and 60),
  created_at timestamptz not null default now()
);
create index if not exists careline_appointments_session_idx on public.careline_appointments(session_id, created_at desc);

create table if not exists public.careline_usage (
  bucket text primary key,
  requests integer not null default 0 check (requests >= 0)
);

alter table public.careline_departments enable row level security;
alter table public.careline_doctors enable row level security;
alter table public.careline_slots enable row level security;
alter table public.careline_appointments enable row level security;
alter table public.careline_usage enable row level security;

revoke all on public.careline_departments, public.careline_doctors,
  public.careline_slots, public.careline_appointments, public.careline_usage from anon, authenticated;
grant select on public.careline_departments, public.careline_doctors, public.careline_slots to service_role;
grant select, insert on public.careline_appointments to service_role;
grant select, insert, update on public.careline_usage to service_role;

create or replace view public.careline_available_slots
with (security_invoker = true) as
select s.id, s.doctor_id, s.starts_at
from public.careline_slots s
where s.starts_at > now()
  and not exists (select 1 from public.careline_appointments a where a.slot_id = s.id);
revoke all on public.careline_available_slots from anon, authenticated;
grant select on public.careline_available_slots to service_role;

-- Reject expired slots even when a previously generated proposal is submitted.
create or replace function public.careline_validate_booking()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.careline_slots where id = new.slot_id and starts_at > now()) then
    raise exception 'Appointment slot is no longer bookable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.careline_validate_booking() from public, anon, authenticated;
drop trigger if exists careline_validate_booking on public.careline_appointments;
create trigger careline_validate_booking before insert on public.careline_appointments
for each row execute function public.careline_validate_booking();

-- Persistent, atomic quotas shared across serverless instances.
-- Counts paid HTTP requests, not dollars; token and audio limits also apply in the app.
create or replace function public.careline_take_quota(visitor uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  daily_bucket text := 'day:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  visitor_bucket text := 'session:' || visitor::text;
  day_count integer;
  visitor_count integer;
begin
  insert into public.careline_usage(bucket) values(daily_bucket) on conflict do nothing;
  insert into public.careline_usage(bucket) values(visitor_bucket) on conflict do nothing;
  -- All requests lock daily first, preserving lock ordering.
  select requests into day_count from public.careline_usage where bucket = daily_bucket for update;
  select requests into visitor_count from public.careline_usage where bucket = visitor_bucket for update;
  if day_count >= 150 or visitor_count >= 30 then return false; end if;
  update public.careline_usage set requests = requests + 1 where bucket in (daily_bucket, visitor_bucket);
  return true;
end;
$$;
revoke all on function public.careline_take_quota(uuid) from public, anon, authenticated;
grant execute on function public.careline_take_quota(uuid) to service_role;

insert into public.careline_departments(id,name) values
('cardiology','Cardiology'),('ent','Otorhinolaryngology'),('dermatology','Dermatology')
on conflict do nothing;
insert into public.careline_doctors(id,department_id,name,title) values
('maya-shah','dermatology','Dr. Maya Shah','Consultant Dermatologist'),
('oliver-chen','dermatology','Dr. Oliver Chen','Consultant Dermatologist'),
('amelia-reed','cardiology','Dr. Amelia Reed','Consultant Cardiologist'),
('arjun-patel','cardiology','Dr. Arjun Patel','Consultant Cardiologist'),
('sophia-morgan','ent','Dr. Sophia Morgan','Consultant Otorhinolaryngologist'),
('ethan-brooks','ent','Dr. Ethan Brooks','Consultant Otorhinolaryngologist')
on conflict do nothing;

-- Two weeks of weekday sessions, 30 minutes per appointment.
-- Convert wall-clock Central time to timestamptz, accounting for daylight saving.
insert into public.careline_slots(doctor_id, starts_at)
select d.id, ((day.date::date + times.start_time) at time zone 'America/Chicago')
from public.careline_doctors d
cross join generate_series(
  ((now() at time zone 'America/Chicago')::date + 1)::timestamp,
  ((now() at time zone 'America/Chicago')::date + 14)::timestamp,
  interval '1 day'
) as day(date)
cross join (values (time '09:00'),(time '09:30'),(time '11:00'),(time '14:00'),(time '15:00'),(time '15:30')) times(start_time)
where extract(isodow from day.date) between 1 and 5
on conflict (doctor_id, starts_at) do nothing;

commit;

-- Verification: expect 3 departments, 6 physicians, and 360 slots on first setup.
select 'departments' as entity, count(*) from public.careline_departments
union all select 'physicians', count(*) from public.careline_doctors
union all select 'available slots', count(*) from public.careline_available_slots;
