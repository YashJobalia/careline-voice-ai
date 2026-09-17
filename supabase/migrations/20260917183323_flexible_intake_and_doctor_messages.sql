-- Notes remain PostgreSQL text, without an application-specific length cap.
alter table public.careline_appointments drop constraint if exists careline_appointments_notes_check;

-- A narrow append operation avoids granting patients unrestricted note updates.
-- The row lock preserves messages when two confirmed updates arrive together.
create or replace function careline_private.message_doctor(booking_id uuid, message_summary text)
returns void language plpgsql security definer set search_path = '' as $$
declare visit public.careline_appointments%rowtype; document jsonb; entry text;
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users where id=auth.uid() and not is_anonymous
  ) then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into visit from public.careline_appointments where id=booking_id for update;
  if not found or visit.session_id<>auth.uid() then
    raise exception 'Appointment not accessible' using errcode='42501';
  end if;
  if message_summary is null or length(trim(message_summary))<3 then
    raise exception 'Provide a message summary' using errcode='22023';
  end if;
  begin
    document := visit.notes::jsonb;
    if jsonb_typeof(document) is distinct from 'object' then
      document := jsonb_build_object('Previous notes',visit.notes);
    end if;
  exception when invalid_text_representation then
    document := jsonb_build_object('Previous notes',visit.notes);
  end;
  entry := to_char(now() at time zone 'UTC','YYYY-MM-DD HH24:MI') || ' UTC - Patient message: ' || trim(message_summary);
  document := jsonb_set(document,'{Doctor messages}',to_jsonb(concat_ws(E'\n\n',nullif(document->>'Doctor messages',''),entry)));
  update public.careline_appointments set notes=document::text where id=booking_id;
end;
$$;
revoke all on function careline_private.message_doctor(uuid,text) from public,anon;
grant execute on function careline_private.message_doctor(uuid,text) to authenticated;
create or replace function public.careline_message_doctor(booking_id uuid,message_summary text)
returns void language sql security invoker set search_path='' as $$
  select careline_private.message_doctor(booking_id,message_summary);
$$;
revoke all on function public.careline_message_doctor(uuid,text) from public,anon;
grant execute on function public.careline_message_doctor(uuid,text) to authenticated;
