-- Minimal account-access lookup: exact contact -> boolean only, never a profile.
create table careline_private.account_lookup_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null
);
revoke all on careline_private.account_lookup_limits from public,anon,authenticated;
alter table careline_private.account_lookup_limits enable row level security;

create function careline_private.lookup_account(contact text, contact_type text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid := auth.uid(); value text := lower(btrim(contact)); used integer;
begin
  if caller is null or not exists(select 1 from auth.users where id=caller) then raise exception 'Guest session required' using errcode='42501'; end if;
  if contact_type='email' then
    if length(value)>254 or value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a complete email' using errcode='22023'; end if;
  elsif contact_type='phone' then
    value := regexp_replace(value,'[[:space:]().-]','','g');
    if value !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Use the full international phone' using errcode='22023'; end if;
  else raise exception 'Unsupported contact type' using errcode='22023'; end if;
  if value is null then raise exception 'Contact required' using errcode='22023'; end if;
  insert into careline_private.account_lookup_limits as limits(user_id,window_start,attempts)
  values(caller,now(),1)
  on conflict(user_id) do update set
    window_start=case when limits.window_start<now()-interval '1 hour' then now() else limits.window_start end,
    attempts=case when limits.window_start<now()-interval '1 hour' then 1 else least(limits.attempts+1,11) end
  returning attempts into used;
  if used>10 then return jsonb_build_object('status','rate_limited'); end if;
  return jsonb_build_object('status',case when exists(
    select 1 from public.careline_patients p join auth.users u on u.id=p.user_id
    where not u.is_anonymous and ((contact_type='email' and lower(p.email)=value) or (contact_type='phone' and p.phone=value))
  ) then 'found' else 'not_found' end);
end; $$;
revoke all on function careline_private.lookup_account(text,text) from public,anon;
grant execute on function careline_private.lookup_account(text,text) to authenticated;
create function public.careline_lookup_account(contact text,contact_type text)
returns jsonb language sql security invoker set search_path='' as $$ select careline_private.lookup_account(contact,contact_type); $$;
revoke all on function public.careline_lookup_account(text,text) from public,anon;
grant execute on function public.careline_lookup_account(text,text) to authenticated;
