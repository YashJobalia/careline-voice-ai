alter table public.careline_appointments add column status text not null default 'confirmed' check(status in ('confirmed','cancelled'));
alter table public.careline_appointments add constraint careline_appointments_user_fk foreign key(session_id) references auth.users(id) on delete cascade;
alter table public.careline_appointments drop constraint careline_appointments_slot_id_key;
create unique index careline_one_booking_per_slot on public.careline_appointments(slot_id) where status='confirmed';
create policy "Users read own bookings" on public.careline_appointments for select to authenticated using(session_id=(select auth.uid()));
create policy "Users book for themselves" on public.careline_appointments for insert to authenticated with check(session_id=(select auth.uid()) and status='confirmed');
create policy "Clinic departments readable" on public.careline_departments for select to anon,authenticated using(true);
create policy "Clinic doctors readable" on public.careline_doctors for select to anon,authenticated using(true);
create policy "Clinic slots readable" on public.careline_slots for select to anon,authenticated using(true);
grant select on public.careline_departments,public.careline_doctors,public.careline_slots to anon,authenticated;
grant select,insert on public.careline_appointments to authenticated;
-- Only sanitized availability is exposed; patient data remains private.
create or replace function public.careline_get_slots()
returns table(id uuid,doctor_id text,starts_at timestamptz)
language sql stable security definer set search_path='' as $$
 select s.id,s.doctor_id,s.starts_at from public.careline_slots s
 where s.starts_at>now() and not exists(select 1 from public.careline_appointments a where a.slot_id=s.id and a.status='confirmed')
 order by s.starts_at limit 500;
$$;
revoke all on function public.careline_get_slots() from public;
grant execute on function public.careline_get_slots() to anon,authenticated,service_role;
create or replace function public.careline_cancel_booking(booking_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 update public.careline_appointments a set status='cancelled'
 where a.id=booking_id and a.session_id=auth.uid() and a.status='confirmed'
 and exists(select 1 from public.careline_slots s where s.id=a.slot_id and s.starts_at>now());
 return found;
end; $$;
revoke all on function public.careline_cancel_booking(uuid) from public,anon;
grant execute on function public.careline_cancel_booking(uuid) to authenticated;
-- Persistent atomic request limits, not a guaranteed dollar cap.
create or replace function public.careline_take_quota(visitor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare daily_bucket text := 'day:'||to_char(now() at time zone 'UTC','YYYY-MM-DD');
user_bucket text := daily_bucket||':user:'||visitor::text;
day_count integer; user_count integer;
begin
 if auth.uid() is null or visitor<>auth.uid() then raise exception 'Not authorized'; end if;
 insert into public.careline_usage(bucket) values(daily_bucket) on conflict do nothing;
 insert into public.careline_usage(bucket) values(user_bucket) on conflict do nothing;
 select requests into day_count from public.careline_usage where bucket=daily_bucket for update;
 select requests into user_count from public.careline_usage where bucket=user_bucket for update;
 if day_count>=150 or user_count>=30 then return false; end if;
 update public.careline_usage set requests=requests+1 where bucket in(daily_bucket,user_bucket);
 return true;
end; $$;
revoke all on function public.careline_take_quota(uuid) from public,anon;
grant execute on function public.careline_take_quota(uuid) to authenticated;
create or replace view public.careline_available_slots with(security_invoker=true) as
select s.id,s.doctor_id,s.starts_at from public.careline_slots s where s.starts_at>now()
and not exists(select 1 from public.careline_appointments a where a.slot_id=s.id and a.status='confirmed');
revoke all on public.careline_available_slots from anon,authenticated;
