-- Shared account pool. Only privileged provisioning can assign doctor access.
alter table public.careline_patients add column email text not null;
alter table public.careline_patients add column phone text not null;
alter table public.careline_patients add column account_type text not null default 'patient' check(account_type in ('patient','doctor'));
alter table public.careline_patients add column doctor_id text unique references public.careline_doctors(id);
alter table public.careline_patients add constraint doctor_identity check ((account_type='doctor') = (doctor_id is not null));
alter table public.careline_patients add constraint contact_required check (email like '%@%' and phone ~ '^\+[1-9][0-9]{7,14}$');
create index careline_patients_doctor_idx on public.careline_patients(doctor_id);

alter table public.careline_appointments add column notes text not null default '' check(length(notes)<=2000);
alter table public.careline_appointments add column cancellation_reason text;
alter table public.careline_appointments add column reschedule_requested boolean not null default false;
alter table public.careline_appointments add column reschedule_reason text;
alter table public.careline_appointments add column updated_at timestamptz not null default now();
alter table public.careline_appointments add constraint appointment_owner foreign key(session_id) references auth.users(id) on delete cascade;

create function careline_private.is_doctor() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.careline_patients where user_id=auth.uid() and account_type='doctor');
$$;
revoke all on function careline_private.is_doctor() from public,anon;
grant execute on function careline_private.is_doctor() to authenticated;
create policy "Doctors read clinic appointments" on public.careline_appointments for select to authenticated using ((select careline_private.is_doctor()));
grant insert(notes) on public.careline_appointments to authenticated;
drop policy "Users book for themselves" on public.careline_appointments;
create policy "Users book for themselves" on public.careline_appointments for insert to authenticated with check(
 session_id=(select auth.uid()) and status='confirmed' and exists(select 1 from public.careline_patients p where p.user_id=(select auth.uid()))
);

-- Protect every write, including the older booking and rescheduling routes.
create function careline_private.validate_visit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.slot_id<>old.slot_id then
  if not exists(select 1 from public.careline_slots s where s.id=new.slot_id and s.starts_at>now()) then raise exception 'Choose a future slot' using errcode='23514'; end if;
  if exists(select 1 from public.careline_patients p join public.careline_slots s on s.doctor_id=p.doctor_id where p.user_id=new.session_id and s.id=new.slot_id) then raise exception 'Doctors cannot book themselves' using errcode='23514'; end if;
 end if;
 if tg_op='UPDATE' and new.slot_id<>old.slot_id then new.reschedule_requested=false; new.reschedule_reason=null; end if;
 new.updated_at=now(); return new;
end; $$;
revoke all on function careline_private.validate_visit() from public,anon,authenticated;
create trigger validate_careline_visit before insert or update on public.careline_appointments for each row execute function careline_private.validate_visit();

create function careline_private.manage_visit(booking_id uuid, operation text, reason text default '') returns boolean language plpgsql security definer set search_path='' as $$
declare a public.careline_appointments%rowtype; doctor boolean;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then raise exception 'Sign in required' using errcode='42501'; end if;
 doctor:=careline_private.is_doctor();
 select * into a from public.careline_appointments where id=booking_id for update;
 if not found or (a.session_id<>auth.uid() and not doctor) then raise exception 'Appointment not accessible' using errcode='42501'; end if;
 if a.status<>'confirmed' or not exists(select 1 from public.careline_slots where id=a.slot_id and starts_at>now()) then return false; end if;
 if length(reason)>600 then raise exception 'Reason too long'; end if;
 if operation='cancel' then update public.careline_appointments set status='cancelled',cancellation_reason=nullif(reason,''),reschedule_requested=false where id=booking_id;
 elsif operation='request_reschedule' and doctor then update public.careline_appointments set reschedule_requested=true,reschedule_reason=nullif(reason,'') where id=booking_id;
 else raise exception 'Action not permitted' using errcode='42501'; end if;
 return true;
end; $$;
revoke all on function careline_private.manage_visit(uuid,text,text) from public,anon;
grant execute on function careline_private.manage_visit(uuid,text,text) to authenticated;
create function public.careline_manage_visit(booking_id uuid,operation text,reason text default '') returns boolean language sql security invoker set search_path='' as $$ select careline_private.manage_visit(booking_id,operation,reason); $$;
revoke all on function public.careline_manage_visit(uuid,text,text) from public,anon;
grant execute on function public.careline_manage_visit(uuid,text,text) to authenticated;

create table public.careline_conversations (
 user_id uuid primary key references auth.users(id) on delete cascade,
 messages jsonb not null default '[]' check(jsonb_typeof(messages)='array' and jsonb_array_length(messages)<=200),
 updated_at timestamptz not null default now()
);
alter table public.careline_conversations enable row level security;
grant select,insert,update,delete on public.careline_conversations to authenticated;
create policy "Own conversation" on public.careline_conversations for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Registration and profile changes derive the ID from the authenticated session.
grant insert(user_id,patient_id,full_name,date_of_birth,email,phone,consented_at) on public.careline_patients to authenticated;
grant update(full_name,date_of_birth,phone) on public.careline_patients to authenticated;
create policy "Register own patient profile" on public.careline_patients for insert to authenticated with check(user_id=(select auth.uid()) and account_type='patient' and doctor_id is null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
create policy "Update own details" on public.careline_patients for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
