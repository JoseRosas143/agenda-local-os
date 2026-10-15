-- DEVELOPMENT ONLY. Run the ENTIRE file as postgres in Supabase SQL Editor.
-- Uses real anon/authenticated DB roles but SIMULATED JWT claims, not HTTP login.
-- All users, organizations, grants and temporary helpers are ROLLED BACK.
-- Never replace the final ROLLBACK with COMMIT. No email or password is created.
-- If an error interrupts the script, run ROLLBACK; and report the error.
begin;
set local statement_timeout = '45s';
set local lock_timeout = '5s';

create temporary table step5_ctx (label text primary key, value uuid not null) on commit drop;
create temporary table step5_results (test text primary key, result text not null) on commit drop;
grant select, insert, update on step5_ctx to authenticated;
grant select, insert on step5_results to authenticated, anon;
grant select on step5_ctx to anon;
insert into step5_ctx(label,value) values
  ('owner_a',gen_random_uuid()), ('owner_b',gen_random_uuid()),
  ('admin_a',gen_random_uuid()), ('member_a',gen_random_uuid()), ('outsider',gen_random_uuid());

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,
  raw_user_meta_data,created_at,updated_at,is_anonymous)
select value,'authenticated','authenticated',
  'step5-' || value::text || '@example.invalid',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),false
from step5_ctx;

create function pg_temp.step5_id(p_label text) returns uuid language sql as $$
  select value from pg_temp.step5_ctx where label = p_label
$$;
create function pg_temp.step5_as(p_label text) returns void language plpgsql as $$
declare v_user uuid := pg_temp.step5_id(p_label);
begin
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claim.sub',coalesce(v_user::text,''),true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v_user,'role','authenticated','is_anonymous',false)::text,true);
end;
$$;
create function pg_temp.step5_assert(p_ok boolean,p_test text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %',p_test; end if;
  insert into pg_temp.step5_results values (p_test,'PASS');
end;
$$;
create function pg_temp.step5_error(p_sql text,p_state text,p_test text) returns void language plpgsql as $$
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
  insert into pg_temp.step5_results values(p_test,'PASS');
end;
$$;
-- Helpers are temporary and SECURITY INVOKER; they do not elevate the tested role.
do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid=pg_my_temp_schema();
  execute format('grant usage on schema %I to anon, authenticated',v_schema);
end;
$$;
grant execute on function pg_temp.step5_id(text), pg_temp.step5_as(text),
  pg_temp.step5_assert(boolean,text), pg_temp.step5_error(text,text,text) to anon, authenticated;

select pg_temp.step5_assert((select count(*) = 5 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('profiles','organizations','organization_members',
  'member_permissions','audit_events') and c.relrowsecurity),'01 - RLS enabled on all five tables');

set local role anon;
select pg_temp.step5_error('select * from public.organizations','42501','02 - anon cannot read organizations');
select pg_temp.step5_error($q$select public.create_organization('X','anon-test')$q$,
 '42501','03 - anon cannot execute organization bootstrap');

set local role authenticated;
select pg_temp.step5_as('missing');
select pg_temp.step5_error($q$select public.create_organization('X','no-session')$q$,
 '42501','04 - authenticated role without a user is rejected');
select pg_temp.step5_as('owner_a');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.step5_id('owner_a'),
 'role','authenticated','is_anonymous',true)::text,true);
select pg_temp.step5_error($q$select public.create_organization('X','anonymous-session')$q$,
 '42501','05 - anonymous Auth session cannot bootstrap an organization');
select pg_temp.step5_as('owner_a');

insert into pg_temp.step5_ctx values ('org_a',public.create_organization(
 'Synthetic Clinic A','s5-a-' || pg_temp.step5_id('owner_a')::text,'dental'));
insert into pg_temp.step5_ctx select 'member_owner_a',id from public.organization_members
 where organization_id = pg_temp.step5_id('org_a') and user_id = pg_temp.step5_id('owner_a');
select pg_temp.step5_assert((select role = 'owner' and status='active' and clinical_role is null
 and clinical_scope='assigned' from public.organization_members where id=pg_temp.step5_id('member_owner_a')),
 '06 - creator is active owner without clinical authority');
select pg_temp.step5_assert((select healthcare_enabled and not clinical_ai_enabled from public.organizations
 where id=pg_temp.step5_id('org_a')),'07 - dental flag does not automatically activate clinical AI');
select pg_temp.step5_assert((select count(*)=0 from public.member_permissions),
 '08 - no permissions auto-granted to commercial owner');
select pg_temp.step5_error(format('select public.create_organization(%L,%L)','Duplicate',
 's5-a-' || pg_temp.step5_id('owner_a')::text),'23505','09 - duplicate slug rejected atomically');
select pg_temp.step5_error($q$select public.create_organization('X','bad-zone','general','Mars/Olympus')$q$,
 '22023','10 - invalid timezone rejected');

select pg_temp.step5_as('owner_b');
insert into pg_temp.step5_ctx values ('org_b',public.create_organization(
 'Synthetic Business B','s5-b-' || pg_temp.step5_id('owner_b')::text));
insert into pg_temp.step5_ctx select 'member_owner_b',id from public.organization_members
 where organization_id=pg_temp.step5_id('org_b') and user_id=pg_temp.step5_id('owner_b');
select pg_temp.step5_assert((select count(*)=0 from public.organizations where id=pg_temp.step5_id('org_a')),
 '11 - owner B cannot read organization A');

select pg_temp.step5_as('owner_a');
insert into pg_temp.step5_ctx values ('member_admin_a', public.add_organization_member(
 pg_temp.step5_id('org_a'),pg_temp.step5_id('admin_a'),'admin'));
insert into pg_temp.step5_ctx values ('member_member_a', public.add_organization_member(
 pg_temp.step5_id('org_a'),pg_temp.step5_id('member_a'),'member'));
select pg_temp.step5_assert((select count(*)=3 from public.organization_members
 where organization_id=pg_temp.step5_id('org_a')),'12 - owner can provision and read own roster');
select pg_temp.step5_error(format('select public.add_organization_member(%L,%L,%L)',
 pg_temp.step5_id('org_b'),pg_temp.step5_id('owner_a'),'owner'),'42501',
 '13 - owner of A cannot provision users in B');
select pg_temp.step5_error(format('select public.update_organization_member(%L,%L,%L,%L)',
 pg_temp.step5_id('org_a'),pg_temp.step5_id('member_owner_b'),'member','active'),'42501',
 '14 - member UUID from B is not valid in organization A');
select pg_temp.step5_error(format('select public.update_organization_member(%L,%L,%L,%L)',
 pg_temp.step5_id('org_a'),pg_temp.step5_id('member_owner_a'),'admin','active'),'23514',
 '15 - last owner cannot be demoted');
select pg_temp.step5_error(format('select public.update_organization_member(%L,%L,%L,%L)',
 pg_temp.step5_id('org_a'),pg_temp.step5_id('member_owner_a'),'owner','suspended'),'23514',
 '16 - last owner cannot be suspended');

insert into public.profiles(user_id,display_name) values(pg_temp.step5_id('owner_a'),'Owner A');
select pg_temp.step5_as('member_a');
insert into public.profiles(user_id,display_name) values(pg_temp.step5_id('member_a'),'Member A');
update public.profiles set display_name='Member A updated' where user_id=auth.uid();
select pg_temp.step5_assert((select count(*)=1 from public.profiles),
 '17 - own profile editable; other personal profiles hidden');
select pg_temp.step5_assert((select count(*)=1 from public.organization_members),
 '18 - ordinary member sees only own membership, not roster');
select pg_temp.step5_assert((select count(*)=0 from public.organizations where id=pg_temp.step5_id('org_b')),
 '19 - member cannot read an unrelated organization');
select pg_temp.step5_error($q$update public.organization_members set role='owner' where user_id=auth.uid()$q$,
 '42501','20 - direct role escalation denied');
select pg_temp.step5_error($q$update public.organization_members set clinical_role='doctor',clinical_scope='organization'
 where user_id=auth.uid()$q$,'42501','21 - direct clinical escalation denied');
select pg_temp.step5_error(format('insert into public.organization_members(organization_id,user_id,role) values(%L,%L,%L)',
 pg_temp.step5_id('org_b'),pg_temp.step5_id('member_a'),'owner'),'42501','22 - direct self-enrollment denied');
select pg_temp.step5_error(format('select public.update_organization_member(%L,%L,%L,%L)',
 pg_temp.step5_id('org_a'),pg_temp.step5_id('member_member_a'),'owner','active'),'42501',
 '23 - RPC role escalation denied for ordinary member');
select pg_temp.step5_error(format('insert into public.member_permissions(organization_id,member_id,permission,grant_source)
 values(%L,%L,%L,%L)',pg_temp.step5_id('org_a'),pg_temp.step5_id('member_member_a'),'clinical.read','system'),
 '42501','24 - direct clinical permission grant denied');
select pg_temp.step5_assert((select count(*)=0 from public.audit_events),'25 - audit requires explicit audit.read');

select pg_temp.step5_as('admin_a');
insert into pg_temp.step5_ctx values ('member_outsider_a',public.add_organization_member(
 pg_temp.step5_id('org_a'),pg_temp.step5_id('outsider'),'member'));
select pg_temp.step5_assert((select count(*)=4 from public.organization_members),
 '26 - admin can provision a basic member');
select pg_temp.step5_error(format('select public.add_organization_member(%L,%L,%L)',
 pg_temp.step5_id('org_a'),pg_temp.step5_id('owner_b'),'admin'),'42501',
 '27 - admin cannot assign another elevated role');
select pg_temp.step5_error(format('select public.update_organization_member(%L,%L,%L,%L)',
 pg_temp.step5_id('org_a'),pg_temp.step5_id('member_owner_a'),'member','active'),'42501',
 '28 - admin cannot modify the owner');
select public.update_organization_member(pg_temp.step5_id('org_a'),pg_temp.step5_id('member_member_a'),'member','suspended');
select pg_temp.step5_as('member_a');
select pg_temp.step5_assert((select count(*)=0 from public.organizations),
 '29 - suspended member loses access with same user claims');
select pg_temp.step5_assert((select count(*)=0 from public.organization_members),
 '30 - suspended member cannot read tenant memberships');

select pg_temp.step5_as('owner_b');
insert into pg_temp.step5_ctx values ('member_member_b',public.add_organization_member(
 pg_temp.step5_id('org_b'),pg_temp.step5_id('member_a'),'member'));
select pg_temp.step5_as('owner_a');
select public.update_organization_member(pg_temp.step5_id('org_a'),pg_temp.step5_id('member_member_a'),'member','active');
select pg_temp.step5_as('member_a');
select pg_temp.step5_assert((select count(*)=2 from public.organizations),
 '31 - one user can belong to two organizations with explicit memberships');
select pg_temp.step5_error(format('update public.organization_members set organization_id=%L where id=%L',
 pg_temp.step5_id('org_b'),pg_temp.step5_id('member_member_a')),'42501',
 '32 - belonging to two organizations does not permit moving rows');

-- Structural checks as postgres, NOT evidence of user RLS success.
reset role;
select pg_temp.step5_as('missing');
select pg_temp.step5_error(format('insert into public.member_permissions(organization_id,member_id,permission,grant_source)
 values(%L,%L,%L,%L)',pg_temp.step5_id('org_a'),pg_temp.step5_id('member_owner_b'),'audit.read','system'),
 '23503','33 - grant cannot point to a membership from another organization');
select pg_temp.step5_error(format('update public.organization_members set organization_id=%L where id=%L',
 pg_temp.step5_id('org_b'),pg_temp.step5_id('member_member_a')),'23514',
 '34 - trigger protects membership tenant identity even for privileged writes');
select pg_temp.step5_error(format('delete from public.organization_members where id=%L',
 pg_temp.step5_id('member_owner_a')),'23514','35 - preserve membership historical authorship');
insert into public.member_permissions(organization_id,member_id,permission,grant_source)
 values(pg_temp.step5_id('org_a'),pg_temp.step5_id('member_owner_a'),'audit.read','system');
select pg_temp.step5_error(format('insert into public.member_permissions(organization_id,member_id,permission,grant_source)
 values(%L,%L,%L,%L)',pg_temp.step5_id('org_a'),pg_temp.step5_id('member_owner_a'),'audit.read','system'),
 '23505','36 - duplicate active grant rejected');

set local role authenticated;
select pg_temp.step5_as('owner_a');
select pg_temp.step5_assert((select count(*)>0 from public.audit_events where organization_id=pg_temp.step5_id('org_a')),
 '37 - explicit auditor can read own operational audit');
select pg_temp.step5_assert((select count(*)=0 from public.audit_events where organization_id=pg_temp.step5_id('org_b')),
 '38 - explicit auditor still cannot read another tenant');
select pg_temp.step5_error($q$delete from public.audit_events$q$,'42501','39 - client cannot delete audit events');
select public.update_organization_member(pg_temp.step5_id('org_a'),pg_temp.step5_id('member_member_a'),'owner','active');
select public.update_organization_member(pg_temp.step5_id('org_a'),pg_temp.step5_id('member_owner_a'),'admin','active');
select pg_temp.step5_assert((select role='admin' from public.organization_members
 where id=pg_temp.step5_id('member_owner_a')),'40 - ownership handover permitted with another active owner');
select pg_temp.step5_error(format('select public.update_organization_member(%L,%L,%L,%L)',
 pg_temp.step5_id('org_a'),pg_temp.step5_id('member_owner_a'),'owner','active'),'42501',
 '41 - former owner cannot self-promote after demotion');

reset role;
select pg_temp.step5_as('missing');
select pg_temp.step5_error($q$update public.audit_events set action='tampered'$q$,
 '23514','42 - audit trigger rejects privileged row tampering');
set constraints all immediate;
select pg_temp.step5_assert(true,'43 - deferred owner constraints satisfied');
select pg_temp.step5_assert((select count(*)=2 from public.organizations where created_by_user_id in
 (pg_temp.step5_id('owner_a'),pg_temp.step5_id('owner_b'))),'44 - duplicate/invalid calls left no partial organization');

select pg_temp.step5_error(format('insert into public.organizations(name,slug,created_by_user_id) values(%L,%L,%L)',
 'Orphan','s5-orphan-' || pg_temp.step5_id('owner_a')::text,pg_temp.step5_id('owner_a')),
 '23514','45 - database constraint rejects an organization without an owner');
select pg_temp.step5_error(format('update public.organization_members set role=%L where id=%L',
 'admin',pg_temp.step5_id('member_member_a')),'23514',
 '46 - database constraint protects last owner outside the public RPC');

select count(*) as tests_passed, 46 as tests_expected,
 bool_and(result='PASS') and count(*)=46 as all_passed,
 'SIMULATED_JWT_REAL_DB_ROLES' as test_mode,
 'ROLLBACK follows; no fixtures persist' as cleanup
from pg_temp.step5_results;
rollback;
