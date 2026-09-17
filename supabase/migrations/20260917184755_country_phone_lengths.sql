-- Country metadata validates national lengths in the app. Store canonical E.164
-- without excluding countries with shorter subscriber numbers.
alter table public.careline_patients drop constraint contact_required;
alter table public.careline_patients add constraint contact_required
  check (email like '%@%' and phone ~ '^\+[1-9][0-9]{1,14}$');
do $$
declare definition text;
begin
  select pg_get_functiondef('careline_private.lookup_account(text,text)'::regprocedure) into definition;
  execute replace(definition,'[0-9]{7,14}','[0-9]{1,14}');
end;
$$;
