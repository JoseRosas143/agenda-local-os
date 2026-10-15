-- Read-only inventory after applying the Step5 migration. No user content or secrets.
select 'tables_with_rls' as check_name,
  count(*)::text as result, '5' as expected
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity
 and c.relname in ('profiles','organizations','organization_members','member_permissions','audit_events')
union all
select 'public_rpcs',count(*)::text,'3' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('create_organization','add_organization_member','update_organization_member')
union all
select 'anon_can_execute_bootstrap',has_function_privilege('anon',
 'public.create_organization(text,text,text,text,text)','EXECUTE')::text,'false'
union all
select 'authenticated_can_execute_bootstrap',has_function_privilege('authenticated',
 'public.create_organization(text,text,text,text,text)','EXECUTE')::text,'true'
union all
select 'authenticated_can_directly_update_members',has_table_privilege('authenticated',
 'public.organization_members','UPDATE')::text,'false'
union all
select 'authenticated_can_directly_insert_grants',has_table_privilege('authenticated',
 'public.member_permissions','INSERT')::text,'false';
