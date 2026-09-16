-- Keep elevated functions outside the exposed Data API schema.
create schema if not exists careline_private;
revoke all on schema careline_private from public;
grant usage on schema careline_private to anon,authenticated,service_role;
alter function public.careline_get_slots() set schema careline_private;
alter function public.careline_cancel_booking(uuid) set schema careline_private;
alter function public.careline_take_quota(uuid) set schema careline_private;
create function public.careline_get_slots() returns table(id uuid,doctor_id text,starts_at timestamptz)
language sql stable security invoker set search_path='' as $$ select * from careline_private.careline_get_slots(); $$;
create function public.careline_cancel_booking(booking_id uuid) returns boolean
language sql security invoker set search_path='' as $$ select careline_private.careline_cancel_booking(booking_id); $$;
create function public.careline_take_quota(visitor uuid) returns boolean
language sql security invoker set search_path='' as $$ select careline_private.careline_take_quota(visitor); $$;
revoke all on function public.careline_get_slots() from public;
revoke all on function public.careline_cancel_booking(uuid) from public,anon;
revoke all on function public.careline_take_quota(uuid) from public,anon;
grant execute on function public.careline_get_slots() to anon,authenticated,service_role;
grant execute on function public.careline_cancel_booking(uuid) to authenticated;
grant execute on function public.careline_take_quota(uuid) to authenticated;
