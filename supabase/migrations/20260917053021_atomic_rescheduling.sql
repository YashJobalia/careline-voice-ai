-- Narrow privileged operation: callers cannot update arbitrary appointment columns.
create or replace function careline_private.careline_reschedule_booking(booking_id uuid, old_slot_id uuid, new_slot_id uuid)
returns table(id uuid, appointment_code text)
language plpgsql security definer set search_path = '' as $$
declare original public.careline_appointments%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select a.* into original from public.careline_appointments a
    where a.id = booking_id and a.session_id = auth.uid() for update;
  if not found or original.status <> 'confirmed' then
    raise exception 'Appointment unavailable' using errcode = '23505';
  end if;
  -- A retry after a successful move returns the same reference without another write.
  if original.slot_id = new_slot_id then
    return query select original.id, original.appointment_code; return;
  end if;
  if original.slot_id <> old_slot_id or not exists (
    select 1 from public.careline_slots s where s.id = original.slot_id and s.starts_at > now()
  ) or not exists (
    select 1 from public.careline_slots s where s.id = new_slot_id and s.starts_at > now()
  ) then raise exception 'Appointment changed or expired' using errcode = '23505'; end if;
  -- The existing unique partial slot index arbitrates concurrent bookings.
  -- A conflict rolls back the whole update and retains the original booking.
  update public.careline_appointments a set slot_id = new_slot_id where a.id = original.id;
  return query select original.id, original.appointment_code;
end;
$$;
revoke all on function careline_private.careline_reschedule_booking(uuid,uuid,uuid) from public,anon;
grant execute on function careline_private.careline_reschedule_booking(uuid,uuid,uuid) to authenticated;

create or replace function public.careline_reschedule_booking(booking_id uuid, old_slot_id uuid, new_slot_id uuid)
returns table(id uuid, appointment_code text)
language sql security invoker set search_path = '' as $$
  select * from careline_private.careline_reschedule_booking(booking_id,old_slot_id,new_slot_id);
$$;
revoke all on function public.careline_reschedule_booking(uuid,uuid,uuid) from public,anon;
grant execute on function public.careline_reschedule_booking(uuid,uuid,uuid) to authenticated;
