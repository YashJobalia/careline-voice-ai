create table public.careline_patients (
 user_id uuid primary key references auth.users(id) on delete cascade,
 patient_id text unique not null,
 full_name text not null check(length(full_name) between 2 and 60),
 date_of_birth date not null check(date_of_birth >= date '1900-01-01' and date_of_birth <= current_date),
 consented_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.careline_patients enable row level security;
revoke all on public.careline_patients from anon, authenticated;
grant select on public.careline_patients to authenticated;
grant all on public.careline_patients to service_role;
create policy "Patients read their own profile" on public.careline_patients for select to authenticated using(user_id=(select auth.uid()));
create sequence careline_private.booking_code_seq minvalue 0 maxvalue 675999 start 0 no cycle;
create function careline_private.next_booking_code() returns text
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 n := nextval('careline_private.booking_code_seq');
 return chr(65 + n / 26000) || chr(65 + (n / 1000) % 26) || lpad((n % 1000)::text,3,'0');
end; $$;
revoke all on function careline_private.next_booking_code() from public,anon;
grant execute on function careline_private.next_booking_code() to authenticated,service_role;
alter table public.careline_appointments add column appointment_code text not null default careline_private.next_booking_code();
alter table public.careline_appointments add constraint careline_appointment_code_unique unique(appointment_code);
alter table public.careline_appointments add constraint careline_appointment_code_format check(appointment_code ~ '^[A-Z]{2}[0-9]{3}$');
-- Clients cannot select their own reference code, owner or confirmation status via an update.
revoke insert on public.careline_appointments from authenticated;
grant insert(slot_id,patient_name,session_id) on public.careline_appointments to authenticated;
drop policy "Users book for themselves" on public.careline_appointments;
create policy "Users book for themselves" on public.careline_appointments for insert to authenticated
with check(session_id=(select auth.uid()) and status='confirmed' and (
 not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
 or exists(select 1 from public.careline_patients p where p.user_id=(select auth.uid()))
));
