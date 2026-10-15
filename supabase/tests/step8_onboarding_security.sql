-- DEVELOPMENT QA ONLY: run the ENTIRE file as postgres in a test/local database.
-- Simulated JWT claims use real anon/authenticated database roles. All fixtures
-- are rolled back. Never replace the final ROLLBACK with COMMIT.
begin;
set local statement_timeout = '45s';
set local lock_timeout = '5s';

create temporary table step8_ctx(label text primary key, value uuid not null) on commit drop;
create temporary table step8_results(test text primary key, result text not null) on commit drop;
grant select, insert on step8_ctx to authenticated;
grant select, insert on step8_results to authenticated, anon;
insert into step8_ctx values
  ('owner_a', gen_random_uuid()), ('owner_b', gen_random_uuid()),
  ('admin_a', gen_random_uuid()), ('member_a', gen_random_uuid());

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,
  raw_user_meta_data,created_at,updated_at,is_anonymous)
select value,'authenticated','authenticated',
  'step8-' || value::text || '@example.invalid',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,
  now(),now(),false from step8_ctx;

create function pg_temp.s8_id(p_label text) returns uuid language sql as $$
  select value from pg_temp.step8_ctx where label=p_label
$$;
create function pg_temp.s8_as(p_label text) returns void language plpgsql as $$
declare v_user uuid := pg_temp.s8_id(p_label);
begin
  perform set_config('request.jwt.claim','',true);
  perform set_config('request.jwt.claim.sub',coalesce(v_user::text,''),true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v_user,'role','authenticated','is_anonymous',false)::text,true);
end;
$$;
create function pg_temp.s8_assert(p_ok boolean,p_test text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %',p_test; end if;
  insert into pg_temp.step8_results values(p_test,'PASS');
end;
$$;
create function pg_temp.s8_error(p_sql text,p_state text,p_test text)
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
  insert into pg_temp.step8_results values(p_test,'PASS');
end;
$$;
do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid=pg_my_temp_schema();
  execute format('grant usage on schema %I to anon,authenticated',v_schema);
end;
$$;
grant execute on function pg_temp.s8_id(text),pg_temp.s8_as(text),
  pg_temp.s8_assert(boolean,text),pg_temp.s8_error(text,text,text) to anon,authenticated;

select pg_temp.s8_assert(
  has_function_privilege('authenticated',
    'public.save_business_onboarding_step(uuid,smallint,text)','EXECUTE')
  and not has_function_privilege('anon',
    'public.save_business_onboarding_step(uuid,smallint,text)','EXECUTE'),
  '01 - only authenticated may execute the setup RPC');
select pg_temp.s8_assert(
  not has_column_privilege('authenticated','public.business_profiles','onboarding_step','UPDATE')
  and not has_column_privilege('authenticated','public.business_profiles','onboarding_completed_at','UPDATE'),
  '02 - clients cannot directly forge progress or completion');

set local role authenticated;
select pg_temp.s8_as('owner_a');
insert into pg_temp.step8_ctx values ('org_a',public.create_organization(
  'Step 8 A','s8-a-' || pg_temp.s8_id('owner_a')::text));
select pg_temp.s8_assert(public.save_business_onboarding_step(
  pg_temp.s8_id('org_a'),3::smallint,' Puebla ')=3,
  '03 - owner saves city as step 3');
select pg_temp.s8_assert((select city='Puebla' and onboarding_step=3
  from public.business_profiles where organization_id=pg_temp.s8_id('org_a')),
  '04 - city and progress persisted together');
select pg_temp.s8_error(format(
  'select public.save_business_onboarding_step(%L,5::smallint,null)',
  pg_temp.s8_id('org_a')),'22023','05 - cannot skip step 4');
select pg_temp.s8_error(format(
  'select public.save_business_onboarding_step(%L,4::smallint,null)',
  pg_temp.s8_id('org_a')),'22023','06 - service required at step 4');
insert into public.services(organization_id,code,name,price)
  values(pg_temp.s8_id('org_a'),'consulta','Consulta',100);
select pg_temp.s8_assert(public.save_business_onboarding_step(
  pg_temp.s8_id('org_a'),4::smallint,null)=4,
  '07 - owner confirms active service');
select pg_temp.s8_assert(public.save_business_onboarding_step(
  pg_temp.s8_id('org_a'),5::smallint,null)=5,
  '08 - owner confirms service price');
select pg_temp.s8_assert(public.save_business_onboarding_step(
  pg_temp.s8_id('org_a'),6::smallint,'Familias de Puebla')=6,
  '09 - ideal customer saved');
select pg_temp.s8_error(format(
  'select public.save_business_onboarding_step(%L,7::smallint,%L)',
  pg_temp.s8_id('org_a'),'------()'),'22023',
  '10 - punctuation-only WhatsApp is rejected');
select pg_temp.s8_assert(public.save_business_onboarding_step(
  pg_temp.s8_id('org_a'),7::smallint,null)=7,
  '11 - WhatsApp can be omitted without opt-in');
select pg_temp.s8_error(format(
  'select public.save_business_onboarding_step(%L,8::smallint,%L)',
  pg_temp.s8_id('org_a'),'clinical_ai'),'22023',
  '12 - unsupported tone is rejected');
select pg_temp.s8_assert(public.save_business_onboarding_step(
  pg_temp.s8_id('org_a'),8::smallint,'profesional')=8,
  '13 - tone is saved');
select pg_temp.s8_assert(public.save_business_onboarding_step(
  pg_temp.s8_id('org_a'),9::smallint,'agendar_mas_citas')=9,
  '14 - final goal completes setup');
select pg_temp.s8_assert((select onboarding_step=9
  and onboarding_completed_at is not null and primary_goal='agendar_mas_citas'
  from public.business_profiles where organization_id=pg_temp.s8_id('org_a')),
  '15 - completion persisted');
-- Audit rows require audit.read under RLS. Verify them as the local test
-- administrator rather than granting that permission to the owner fixture.
reset role;
select pg_temp.s8_assert((select count(*)=7 from public.audit_events
  where organization_id=pg_temp.s8_id('org_a')
    and action='business.onboarding_step_saved'
    and safe_metadata ? 'step'
    and not (safe_metadata ? 'value')),
  '16 - seven setup audit records omit submitted values');
set local role authenticated;

select pg_temp.s8_as('owner_b');
insert into pg_temp.step8_ctx values ('org_b',public.create_organization(
  'Step 8 B','s8-b-' || pg_temp.s8_id('owner_b')::text));
select pg_temp.s8_error(format(
  'select public.save_business_onboarding_step(%L,3::smallint,%L)',
  pg_temp.s8_id('org_a'),'Cross tenant'),'42501',
  '17 - another owner cannot change A');
select pg_temp.s8_error(format(
  'select public.save_business_onboarding_step(%L,3::smallint,%L)',
  pg_temp.s8_id('org_b'),'x' || repeat('x',1000)),'22023',
  '18 - oversized value is rejected');

select pg_temp.s8_as('owner_a');
select public.add_organization_member(pg_temp.s8_id('org_a'),
  pg_temp.s8_id('admin_a'),'admin');
select public.add_organization_member(pg_temp.s8_id('org_a'),
  pg_temp.s8_id('member_a'),'member');
select pg_temp.s8_as('member_a');
select pg_temp.s8_error(format(
  'select public.save_business_onboarding_step(%L,3::smallint,%L)',
  pg_temp.s8_id('org_a'),'Member write'),'42501',
  '19 - member cannot edit setup');
select pg_temp.s8_as('admin_a');
select pg_temp.s8_assert(public.save_business_onboarding_step(
  pg_temp.s8_id('org_a'),3::smallint,'Cholula')=9,
  '20 - admin may revise a completed setup step');

reset role;
select count(*) as tests_passed,20 as tests_expected,
  count(*)=20 and bool_and(result='PASS') as all_passed,
  'SIMULATED_JWT_REAL_DB_ROLES' as test_mode,
  'ROLLBACK follows; no fixtures persist' as cleanup
from pg_temp.step8_results;
rollback;
