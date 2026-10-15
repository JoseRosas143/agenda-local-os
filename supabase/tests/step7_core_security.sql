-- DEVELOPMENT ONLY. Run the ENTIRE file as postgres in Supabase SQL Editor.
-- Uses simulated JWT claims with real anon/authenticated database roles.
-- All fixtures and helpers are rolled back. Never replace ROLLBACK with COMMIT.
-- If execution stops, run ROLLBACK; before retrying.
begin;
set local statement_timeout = '45s';
set local lock_timeout = '5s';

create temporary table step7_ctx (label text primary key, value uuid not null) on commit drop;
create temporary table step7_results (test text primary key, result text not null) on commit drop;
grant select, insert on step7_ctx to authenticated;
grant select, insert on step7_results to authenticated, anon;
insert into step7_ctx(label,value) values
  ('owner_a',gen_random_uuid()),('owner_b',gen_random_uuid()),
  ('admin_a',gen_random_uuid()),('member_a',gen_random_uuid());

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,
  raw_user_meta_data,created_at,updated_at,is_anonymous)
select value,'authenticated','authenticated',
  'step7-' || value::text || '@example.invalid',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),false
from step7_ctx;

create function pg_temp.s7_id(p_label text) returns uuid language sql as $$
  select value from pg_temp.step7_ctx where label=p_label
$$;
create function pg_temp.s7_as(p_label text) returns void language plpgsql as $$
declare v_user uuid := pg_temp.s7_id(p_label);
begin
  perform set_config('request.jwt.claim','',true);
  perform set_config('request.jwt.claim.sub',coalesce(v_user::text,''),true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v_user,'role','authenticated','is_anonymous',false)::text,true);
end;
$$;
create function pg_temp.s7_assert(p_ok boolean,p_test text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %',p_test; end if;
  insert into pg_temp.step7_results values(p_test,'PASS');
end;
$$;
create function pg_temp.s7_error(p_sql text,p_state text,p_test text)
returns void language plpgsql as $$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if v_state is distinct from p_state then
    raise exception 'FAIL: %; expected SQLSTATE %, got %',p_test,p_state,coalesce(v_state,'SUCCESS');
  end if;
  insert into pg_temp.step7_results values(p_test,'PASS');
end;
$$;
create function pg_temp.s7_zero_rows(p_sql text,p_test text)
returns void language plpgsql as $$
declare v_count bigint;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'FAIL: %; updated % rows',p_test,v_count; end if;
  insert into pg_temp.step7_results values(p_test,'PASS');
end;
$$;
do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid=pg_my_temp_schema();
  execute format('grant usage on schema %I to anon,authenticated',v_schema);
end;
$$;
grant execute on function pg_temp.s7_id(text),pg_temp.s7_as(text),
  pg_temp.s7_assert(boolean,text),pg_temp.s7_error(text,text,text),
  pg_temp.s7_zero_rows(text,text) to anon,authenticated;

select pg_temp.s7_assert((
  select count(*)=9 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in
    ('business_profiles','services','contacts','pipeline_stages','leads',
     'activities','followups','appointments','communication_preferences')
    and c.relrowsecurity
),'01 - all nine Step 7 tables have RLS');
select pg_temp.s7_assert((
  select count(*)=9 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in
    ('business_profiles','services','contacts','pipeline_stages','leads',
     'activities','followups','appointments','communication_preferences')
    and has_table_privilege('authenticated',c.oid,'SELECT')
),'02 - authenticated can select nine tenant-filtered tables');
select pg_temp.s7_assert((
  select count(*)=6 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in
    ('pipeline_stages','leads','activities','followups','appointments','communication_preferences')
    and not has_table_privilege('authenticated',c.oid,'INSERT')
    and not has_table_privilege('authenticated',c.oid,'UPDATE')
    and not has_table_privilege('authenticated',c.oid,'DELETE')
),'03 - six CRM workflow tables deny direct client writes');

set local role anon;
select pg_temp.s7_error('select * from public.contacts','42501','04 - anon cannot read contacts');
select pg_temp.s7_error('select * from public.services','42501','05 - anon cannot read services');

set local role authenticated;
select pg_temp.s7_as('owner_a');
insert into pg_temp.step7_ctx values ('org_a',public.create_organization(
  'Step 7 A','s7-a-' || pg_temp.s7_id('owner_a')::text));
insert into pg_temp.step7_ctx values ('member_owner_a',(
  select id from public.organization_members
  where organization_id=pg_temp.s7_id('org_a') and user_id=pg_temp.s7_id('owner_a')));
insert into pg_temp.step7_ctx values ('member_admin_a',public.add_organization_member(
  pg_temp.s7_id('org_a'),pg_temp.s7_id('admin_a'),'admin'));
insert into pg_temp.step7_ctx values ('member_member_a',public.add_organization_member(
  pg_temp.s7_id('org_a'),pg_temp.s7_id('member_a'),'member'));
insert into public.business_profiles(organization_id,city) values(pg_temp.s7_id('org_a'),'CDMX');
insert into public.services(organization_id,code,name,price)
  values(pg_temp.s7_id('org_a'),'consult','Consulta',100);
insert into public.contacts(organization_id,display_name,email)
  values(pg_temp.s7_id('org_a'),'A Client','shared@example.invalid');
select pg_temp.s7_assert((select count(*)=1 from public.business_profiles),
  '06 - owner creates and reads own business profile');
select pg_temp.s7_assert((select count(*)=1 from public.services),
  '07 - owner creates and reads own service');
select pg_temp.s7_assert((select count(*)=1 from public.contacts),
  '08 - owner creates and reads own contact');
select pg_temp.s7_error(format(
  'insert into public.business_profiles(organization_id,onboarding_step) values(%L,9)',
  pg_temp.s7_id('org_a')),'42501','09 - client cannot forge onboarding completion');
select pg_temp.s7_error(format(
  'update public.contacts set organization_id=%L where organization_id=%L',
  pg_temp.s7_id('org_a'),pg_temp.s7_id('org_a')),'42501',
  '10 - tenant ID is not client-editable');

select pg_temp.s7_as('owner_b');
insert into pg_temp.step7_ctx values ('org_b',public.create_organization(
  'Step 7 B','s7-b-' || pg_temp.s7_id('owner_b')::text));
insert into public.contacts(organization_id,display_name,email)
  values(pg_temp.s7_id('org_b'),'B Client','shared@example.invalid');
select pg_temp.s7_assert((select count(*)=1 from public.contacts),
  '11 - owner B sees only B contact despite shared email');
select pg_temp.s7_assert((select count(*)=0 from public.services),
  '12 - owner B cannot see A services');
select pg_temp.s7_error(format(
  'insert into public.services(organization_id,code,name) values(%L,%L,%L)',
  pg_temp.s7_id('org_a'),'intrusion','Intrusion'), '42501',
  '13 - owner B cannot create A service');
select pg_temp.s7_zero_rows(format(
  'update public.contacts set display_name=%L where organization_id=%L',
  'Wrong',pg_temp.s7_id('org_a')),
  '14 - owner B cannot update A contact');

select pg_temp.s7_as('member_a');
select pg_temp.s7_assert((select count(*)=1 from public.contacts),
  '15 - member A reads A contact');
select pg_temp.s7_error(format(
  'insert into public.contacts(organization_id,display_name) values(%L,%L)',
  pg_temp.s7_id('org_a'),'Member write'), '42501',
  '16 - member cannot create contact');
select pg_temp.s7_zero_rows('update public.services set price=1',
  '17 - member cannot update services');

select pg_temp.s7_as('admin_a');
update public.services set price=120 where organization_id=pg_temp.s7_id('org_a');
select pg_temp.s7_assert((select price=120 from public.services
  where organization_id=pg_temp.s7_id('org_a')),
  '18 - active admin can update own service');
select pg_temp.s7_error(format(
  'insert into public.contacts(organization_id,display_name) values(%L,%L)',
  pg_temp.s7_id('org_b'),'Cross tenant'), '42501',
  '19 - admin cannot insert in B');

-- A privileged fixture attempts to wire a lead across organizations. The
-- composite foreign key must reject it independently of RLS.
reset role;
insert into public.pipeline_stages(organization_id,stage_key,name,position)
  values(pg_temp.s7_id('org_a'),'new','Nuevo',0);
select pg_temp.s7_error(format(
  'insert into public.leads(organization_id,contact_id,stage_id,title) values(%L,%L,(select id from public.pipeline_stages where organization_id=%L),%L)',
  pg_temp.s7_id('org_a'),
  (select id from public.contacts where organization_id=pg_temp.s7_id('org_b') limit 1),
  pg_temp.s7_id('org_a'),'Cross-tenant lead'), '23503',
  '20 - composite FK rejects B contact on A lead');

set local role authenticated;
select pg_temp.s7_as('owner_a');
select pg_temp.s7_assert((select count(*)=1 from public.pipeline_stages),
  '21 - owner A sees A pipeline stage');
select pg_temp.s7_error(format(
  'insert into public.leads(organization_id,contact_id,stage_id,title) values(%L,%L,%L,%L)',
  pg_temp.s7_id('org_a'),
  (select id from public.contacts where organization_id=pg_temp.s7_id('org_a') limit 1),
  (select id from public.pipeline_stages where organization_id=pg_temp.s7_id('org_a') limit 1),
  'Client bypass'), '42501','22 - direct lead creation is denied');

reset role;
update public.organization_members set status='suspended'
  where id=pg_temp.s7_id('member_member_a');
set local role authenticated;
select pg_temp.s7_as('member_a');
select pg_temp.s7_assert((select count(*)=0 from public.contacts),
  '23 - suspended member loses contact access');
select pg_temp.s7_assert((select count(*)=0 from public.pipeline_stages),
  '24 - suspended member loses pipeline access');

reset role;
select count(*) as tests_passed,24 as tests_expected,
  count(*)=24 and bool_and(result='PASS') as all_passed,
  'SIMULATED_JWT_REAL_DB_ROLES' as test_mode,
  'ROLLBACK follows; no fixtures persist' as cleanup
from pg_temp.step7_results;
rollback;
