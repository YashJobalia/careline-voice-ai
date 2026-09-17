create table careline_private.confirmation_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, token_hash)
);
alter table careline_private.confirmation_attempts enable row level security;
revoke all on careline_private.confirmation_attempts from public, anon, authenticated;

create function careline_private.claim_confirmation(token_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); inserted integer;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if token_hash is null or token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid confirmation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  delete from careline_private.confirmation_attempts a where a.user_id = actor and a.created_at < now() - interval '1 day';
  if (select count(*) from careline_private.confirmation_attempts a where a.user_id = actor and a.created_at > now() - interval '1 hour') >= 60
    then raise exception 'Too many confirmation attempts'; end if;
  insert into careline_private.confirmation_attempts(user_id, token_hash) values (actor, token_hash)
    on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted = 1;
end;
$$;
revoke all on function careline_private.claim_confirmation(text) from public, anon;
grant execute on function careline_private.claim_confirmation(text) to authenticated;
create function public.careline_claim_confirmation(token_hash text)
returns boolean language sql security invoker set search_path = '' as $$
  select careline_private.claim_confirmation(token_hash);
$$;
revoke all on function public.careline_claim_confirmation(text) from public, anon;
grant execute on function public.careline_claim_confirmation(text) to authenticated;
