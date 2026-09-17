-- Explicit opt-in fixture seed for this fictional portfolio project only.
-- Never run against a real patient system. Does not delete or overwrite users.
begin;
do $$
declare fixture record; account_id uuid; visit_slot uuid; past_slot uuid;
begin
 for fixture in select * from (values
  ('alex.demo@example.com','Alex Demo','1994-03-15','+13125550101','patient',null::text),
  ('robin.demo@example.com','Robin Demo','1988-11-02','+13125550102','patient',null::text),
  ('maya.demo@example.com','Dr. Maya Shah','1983-07-21','+13125550103','doctor','maya-shah'),
  ('arjun.demo@example.com','Dr. Arjun Patel','1980-09-09','+13125550104','doctor','arjun-patel')
 ) as f(email,name,dob,phone,account_type,doctor_id)
 loop
  if exists(select 1 from auth.users where email=fixture.email) then continue; end if;
  account_id:=gen_random_uuid();
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,is_anonymous)
  values('00000000-0000-0000-0000-000000000000',account_id,'authenticated','authenticated',fixture.email,extensions.crypt('CarelineDemo!2026',extensions.gen_salt('bf',10)),now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('display_name',fixture.name),now(),now(),'','','','',false);
  insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
  values(account_id::text,account_id,jsonb_build_object('sub',account_id::text,'email',fixture.email,'email_verified',true,'phone_verified',false),'email',now(),now());
  insert into public.careline_patients(user_id,patient_id,full_name,date_of_birth,email,phone,account_type,doctor_id,consented_at)
  values(account_id,'CL'||replace(upper(account_id::text),'-',''),fixture.name,fixture.dob::date,fixture.email,fixture.phone,fixture.account_type,fixture.doctor_id,now());
 end loop;
 -- One upcoming visit per demo patient and a doctor booking with another doctor.
 for fixture in select * from (values
  ('alex.demo@example.com','maya-shah',3,'Skin irritation','Three days','Mild'),
  ('robin.demo@example.com','arjun-patel',4,'Routine cardiology follow-up','Scheduled follow-up','No current symptoms'),
  ('maya.demo@example.com','sophia-morgan',5,'Recurring ear discomfort','One week','Mild')
 ) as f(email,doctor_id,days,concern,duration,severity)
 loop
  select user_id into account_id from public.careline_patients where email=fixture.email;
  if exists(select 1 from public.careline_appointments where session_id=account_id) then continue; end if;
  insert into public.careline_slots(doctor_id,starts_at) values(fixture.doctor_id,((current_date+fixture.days+case extract(dow from current_date+fixture.days)::int when 0 then 1 when 6 then 2 else 0 end)+time '10:00') at time zone 'America/Chicago') on conflict(doctor_id,starts_at) do update set duration_minutes=30 returning id into visit_slot;
  insert into public.careline_appointments(slot_id,session_id,patient_name,notes)
  select visit_slot,account_id,full_name,jsonb_build_object('concern',fixture.concern,'duration',fixture.duration,'severity',fixture.severity,'context','Fictional demo visit.')::text from public.careline_patients where user_id=account_id;
 end loop;
 -- Historical fixture: insert a valid future visit, then date its dedicated slot back.
 select user_id into account_id from public.careline_patients where email='alex.demo@example.com';
 if not exists(select 1 from public.careline_appointments where session_id=account_id and notes like '%Historical demo visit%') then
  insert into public.careline_slots(doctor_id,starts_at) values('oliver-chen',now()+interval '90 days') returning id into past_slot;
  insert into public.careline_appointments(slot_id,session_id,patient_name,notes) values(past_slot,account_id,'Alex Demo','Historical demo visit: routine skin follow-up.');
  update public.careline_slots set starts_at=((current_date-14)+time '11:00') at time zone 'America/Chicago' where id=past_slot;
 end if;
end; $$;
commit;
