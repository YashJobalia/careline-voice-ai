-- Return only appointment IDs the caller may already read. Contact matching
-- happens privately; this is not a public account directory or login bypass.
create function careline_private.search_visits(search_text text, search_scope text default 'mine')
returns table(appointment_id uuid)
language plpgsql stable security definer set search_path='' as $$
declare caller uuid := auth.uid(); q text := lower(btrim(search_text)); digits text;
begin
  if caller is null or not exists(select 1 from public.careline_patients p join auth.users u on u.id=p.user_id where p.user_id=caller and not u.is_anonymous) then
    raise exception 'Sign in required' using errcode='42501';
  end if;
  if search_scope not in ('mine','clinic') or (search_scope='clinic' and not careline_private.is_doctor()) then
    raise exception 'Scope not permitted' using errcode='42501';
  end if;
  if q is null or length(q)<2 or length(q)>254 then raise exception 'Enter 2 to 254 search characters' using errcode='22023'; end if;
  digits := regexp_replace(q,'[^0-9]','','g');
  return query select a.id
    from public.careline_appointments a
    join public.careline_patients p on p.user_id=a.session_id
    join public.careline_slots s on s.id=a.slot_id
    join public.careline_doctors d on d.id=s.doctor_id
    where (a.session_id=caller or search_scope='clinic')
      and (lower(p.email)=q
        or (length(digits)>=8 and regexp_replace(p.phone,'[^0-9]','','g')=digits)
        or strpos(lower(a.patient_name),q)>0
        or strpos(lower(a.appointment_code),q)>0
        or strpos(lower(s.doctor_id),q)>0)
    order by s.starts_at desc,a.id limit 101;
end; $$;
revoke all on function careline_private.search_visits(text,text) from public,anon;
grant execute on function careline_private.search_visits(text,text) to authenticated;
create function public.careline_search_visits(search_text text,search_scope text default 'mine')
returns table(appointment_id uuid) language sql stable security invoker set search_path='' as $$
 select * from careline_private.search_visits(search_text,search_scope);
$$;
revoke all on function public.careline_search_visits(text,text) from public,anon;
grant execute on function public.careline_search_visits(text,text) to authenticated;
