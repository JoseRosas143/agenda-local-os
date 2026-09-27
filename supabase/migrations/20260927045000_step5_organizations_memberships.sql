-- Agenda Local OS - Step 5. Run ONCE with Supabase migrations (transactional).
-- Additive migration: no DROP, no TRUNCATE, no seed users, no clinical records.
-- Contract: docs/database/schema-v1.md. No application login/UI in this step.
-- Do not run individual fragments in SQL Editor or edit a migration after applying it.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  locale text not null default 'es-MX' check (char_length(locale) between 2 and 35),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  slug text not null unique,
  industry text not null default 'general'
    check (industry in ('general','dental','medical')),
  timezone text not null default 'America/Mexico_City',
  currency char(3) not null default 'MXN' check (currency ~ '^[A-Z]{3}$'),
  healthcare_enabled boolean not null default false,
  clinical_ai_enabled boolean not null default false,
  status text not null default 'active'
    check (status in ('active','suspended','archived')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_format check (
    char_length(slug) between 3 and 63 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint organizations_healthcare_industry check (
    not healthcare_enabled or industry in ('dental','medical')
  ),
  constraint organizations_clinical_ai_requires_healthcare check (
    not clinical_ai_enabled or healthcare_enabled
  )
);
create index organizations_creator_idx on public.organizations(created_by_user_id);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null default 'member' check (role in ('owner','admin','member')),
  clinical_role text check (
    clinical_role in ('doctor','dentist','clinical_assistant','reception')
  ),
  clinical_scope text not null default 'assigned'
    check (clinical_scope in ('assigned','organization')),
  status text not null default 'active' check (status in ('active','suspended')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_user_unique unique (organization_id,user_id),
  constraint organization_members_tenant_id_unique unique (organization_id,id)
);
create index organization_members_user_status_idx
  on public.organization_members(user_id,status,organization_id);

create table public.member_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  member_id uuid not null,
  permission text not null check (permission in (
    'clinical.read','clinical.write','clinical.approve',
    'clinical.files.read','clinical.files.write','clinical.ai.request',
    'clinical.access.manage','quotes.read','quotes.write','quotes.discount','audit.read'
  )),
  granted_by_member_id uuid,
  grant_source text not null check (grant_source in ('system','human')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_permissions_tenant_id_unique unique (organization_id,id),
  constraint member_permissions_member_fk foreign key (organization_id,member_id)
    references public.organization_members(organization_id,id) on delete restrict,
  constraint member_permissions_granter_fk foreign key (organization_id,granted_by_member_id)
    references public.organization_members(organization_id,id) on delete restrict,
  constraint member_permissions_human_actor check (
    grant_source <> 'human' or granted_by_member_id is not null
  ),
  constraint member_permissions_revocation_date check (
    revoked_at is null or revoked_at >= created_at
  )
);
create unique index member_permissions_active_unique
  on public.member_permissions(organization_id,member_id,permission)
  where revoked_at is null;
create index member_permissions_member_idx
  on public.member_permissions(organization_id,member_id);
create index member_permissions_granter_idx
  on public.member_permissions(organization_id,granted_by_member_id)
  where granted_by_member_id is not null;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_member_id uuid,
  actor_kind text not null check (actor_kind in ('member','system')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  occurred_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint audit_events_tenant_id_unique unique (organization_id,id),
  constraint audit_events_actor_fk foreign key (organization_id,actor_member_id)
    references public.organization_members(organization_id,id) on delete restrict,
  constraint audit_events_actor_required check (
    (actor_kind = 'member' and actor_member_id is not null)
    or (actor_kind = 'system' and actor_member_id is null)
  )
);
create index audit_events_timeline_idx
  on public.audit_events(organization_id,occurred_at desc,id);
create index audit_events_entity_idx
  on public.audit_events(organization_id,entity_type,entity_id);
create index audit_events_actor_idx
  on public.audit_events(organization_id,actor_member_id)
  where actor_member_id is not null;

-- Deny table access first. Privileges are restricted only on the new objects.
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.member_permissions enable row level security;
alter table public.audit_events enable row level security;
revoke all on public.profiles, public.organizations, public.organization_members,
  public.member_permissions, public.audit_events from public, anon, authenticated, service_role;
grant select on public.profiles, public.organizations, public.organization_members,
  public.member_permissions, public.audit_events to authenticated;
grant insert (user_id,display_name,locale), update (display_name,locale)
  on public.profiles to authenticated;

-- Helpers use the caller's verified auth.uid(), NOT caller-supplied role metadata.
-- A definer helper avoids recursive RLS when reading the membership table itself.
create function private.current_org_role(p_organization_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select m.role
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = p_organization_id
    and m.user_id = (select auth.uid())
    and m.status = 'active' and o.status = 'active'
    and coalesce((select auth.jwt())->>'is_anonymous','false') <> 'true'
$$;

create function private.has_audit_read(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    join public.member_permissions p
      on p.organization_id = m.organization_id and p.member_id = m.id
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active' and o.status = 'active'
      and p.permission = 'audit.read' and p.revoked_at is null
      and coalesce((select auth.jwt())->>'is_anonymous','false') <> 'true'
  )
$$;
revoke all on function private.current_org_role(uuid), private.has_audit_read(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.current_org_role(uuid), private.has_audit_read(uuid)
  to authenticated;

create policy profiles_select_self on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy organizations_select_member on public.organizations for select to authenticated
  using (private.current_org_role(id) is not null);
create policy organization_members_select on public.organization_members for select to authenticated
  using (
    private.current_org_role(organization_id) is not null
    and (user_id = (select auth.uid())
         or private.current_org_role(organization_id) in ('owner','admin'))
  );
create policy member_permissions_select_self on public.member_permissions for select to authenticated
  using (
    private.current_org_role(organization_id) is not null
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = member_permissions.organization_id
        and m.id = member_permissions.member_id and m.user_id = (select auth.uid())
    )
  );
create policy audit_events_select_authorized on public.audit_events for select to authenticated
  using (private.has_audit_read(organization_id));

-- Timestamps and identity protection. No tenant transfer and no hard-delete of memberships.
create function private.guard_profile()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Profile identity is immutable' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile();

create function private.guard_organization()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.id is distinct from old.id
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at) then
    raise exception 'Organization identity is immutable' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
    if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = new.timezone) then
      raise exception 'Unknown IANA timezone' using errcode = '22023';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger organizations_guard before insert or update on public.organizations
  for each row execute function private.guard_organization();

create function private.guard_membership()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Suspend memberships instead of deleting historical authorship'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or new.joined_at is distinct from old.joined_at) then
    raise exception 'Membership identity is immutable' using errcode = '23514';
  end if;
  -- A real row UPDATE serializes membership changes and detects stale snapshots.
  -- Public mutation RPCs acquire this same parent lock before reading authorization.
  update public.organizations set updated_at = clock_timestamp()
    where id = new.organization_id;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger organization_members_guard before insert or update or delete on public.organization_members
  for each row execute function private.guard_membership();

create function private.require_active_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_org uuid;
begin
  if tg_table_name = 'organizations' then v_org := new.id;
  else v_org := new.organization_id;
  end if;
  if exists (select 1 from public.organizations where id = v_org)
     and not exists (select 1 from public.organization_members
                     where organization_id = v_org and role = 'owner' and status = 'active') then
    raise exception 'An organization must retain an active owner' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger organizations_require_owner
  after insert on public.organizations deferrable initially deferred
  for each row execute function private.require_active_owner();
create constraint trigger members_require_owner
  after insert or update on public.organization_members deferrable initially deferred
  for each row execute function private.require_active_owner();

create function private.guard_permission()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Revoke grants instead of deleting them' using errcode = '23514';
  end if;
  if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
     or new.member_id is distinct from old.member_id or new.permission is distinct from old.permission
     or new.granted_by_member_id is distinct from old.granted_by_member_id
     or new.grant_source is distinct from old.grant_source
     or new.created_at is distinct from old.created_at
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'Grant identity is immutable; create a new grant if necessary' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger member_permissions_guard before update or delete on public.member_permissions
  for each row execute function private.guard_permission();

create function private.reject_audit_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'Audit events are append-only' using errcode = '23514';
end;
$$;
create trigger audit_events_immutable before update or delete on public.audit_events
  for each row execute function private.reject_audit_mutation();

-- Only allowlisted metadata is constructed by triggers; no full row snapshots.
create function private.audit_membership_or_permission()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid; v_action text; v_meta jsonb;
begin
  select id into v_actor from public.organization_members
    where organization_id = new.organization_id and user_id = auth.uid();
  if tg_table_name = 'organization_members' then
    if tg_op = 'INSERT' then
      v_action := 'membership.created';
      v_meta := jsonb_build_object('role',new.role,'status',new.status);
    else
      if (new.role,new.status,new.clinical_role,new.clinical_scope)
         is not distinct from (old.role,old.status,old.clinical_role,old.clinical_scope) then
        return null;
      end if;
      v_action := 'membership.updated';
      v_meta := jsonb_build_object('old_role',old.role,'new_role',new.role,
        'old_status',old.status,'new_status',new.status,
        'clinical_role_changed',new.clinical_role is distinct from old.clinical_role,
        'clinical_scope_changed',new.clinical_scope is distinct from old.clinical_scope);
    end if;
  else
    if tg_op = 'UPDATE' and new.revoked_at is not distinct from old.revoked_at then return null; end if;
    v_action := case when new.revoked_at is null then 'permission.granted' else 'permission.revoked' end;
    v_meta := jsonb_build_object('permission',new.permission,'grant_source',new.grant_source);
  end if;
  insert into public.audit_events(organization_id,actor_member_id,actor_kind,
    action,entity_type,entity_id,safe_metadata)
  values (new.organization_id,v_actor,case when v_actor is null then 'system' else 'member' end,
    v_action,tg_table_name,new.id,v_meta);
  return null;
end;
$$;
create trigger memberships_audit after insert or update on public.organization_members
  for each row execute function private.audit_membership_or_permission();
create trigger permissions_audit after insert or update on public.member_permissions
  for each row execute function private.audit_membership_or_permission();

revoke all on function private.guard_profile(), private.guard_organization(),
  private.guard_membership(), private.require_active_owner(), private.guard_permission(),
  private.reject_audit_mutation(), private.audit_membership_or_permission()
  from public, anon, authenticated, service_role;

-- Public RPC 1: atomic bootstrap. No owner id/role/clinical privilege supplied by the client.
create function public.create_organization(
  p_name text, p_slug text, p_industry text default 'general',
  p_timezone text default 'America/Mexico_City', p_currency text default 'MXN'
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_org uuid; v_member uuid;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception 'An authenticated non-anonymous user is required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = v_user and is_anonymous = false) then
    raise exception 'An eligible registered user is required' using errcode = '42501';
  end if;
  if p_name is null or p_slug is null or p_industry is null
     or p_timezone is null or p_currency is null
     or char_length(btrim(p_name)) not between 1 and 160
     or char_length(p_slug) not between 3 and 63
     or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or p_industry not in ('general','dental','medical')
     or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid organization parameters' using errcode = '22023';
  end if;
  insert into public.organizations(name,slug,industry,timezone,currency,
    healthcare_enabled,created_by_user_id)
  values (btrim(p_name),p_slug,p_industry,p_timezone,p_currency,
    p_industry in ('dental','medical'),v_user)
  returning id into v_org;
  insert into public.organization_members(organization_id,user_id,role)
  values (v_org,v_user,'owner') returning id into v_member;
  insert into public.audit_events(organization_id,actor_member_id,actor_kind,
    action,entity_type,entity_id)
  values (v_org,v_member,'member','organization.created','organizations',v_org);
  -- No clinical_role assignment and no permission grants, even for the owner.
  return v_org;
end;
$$;

-- Public RPC 2: controlled administrative provisioning of an EXISTING Auth user.
-- It does not send invitations/email or allow a user to self-enroll in a tenant.
create function public.add_organization_member(
  p_organization_id uuid, p_user_id uuid, p_role text default 'member'
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_actor_role text; v_member uuid;
begin
  v_actor_role := private.current_org_role(p_organization_id);
  if v_actor_role is null or v_actor_role not in ('owner','admin') then
    raise exception 'Not authorized to manage this organization' using errcode = '42501';
  end if;
  -- All role mutation RPCs lock the parent BEFORE re-reading the actor and target.
  update public.organizations set updated_at = clock_timestamp() where id = p_organization_id;
  v_actor_role := private.current_org_role(p_organization_id);
  if v_actor_role is null or v_actor_role not in ('owner','admin') then
    raise exception 'Not authorized to manage this organization' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('owner','admin','member') or p_user_id is null then
    raise exception 'Invalid membership parameters' using errcode = '22023';
  end if;
  if v_actor_role = 'admin' and p_role <> 'member' then
    raise exception 'Only owners can assign elevated commercial roles' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id and is_anonymous = false) then
    raise exception 'Eligible registered user not found' using errcode = '22023';
  end if;
  insert into public.organization_members(organization_id,user_id,role)
  values (p_organization_id,p_user_id,p_role) returning id into v_member;
  return v_member;
end;
$$;

-- Public RPC 3: explicit replacement of commercial role + membership status.
-- Identity, join date, clinical role/scope and permission grants are not parameters.
create function public.update_organization_member(
  p_organization_id uuid, p_member_id uuid, p_role text, p_status text
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor_role text; v_target public.organization_members%rowtype;
begin
  v_actor_role := private.current_org_role(p_organization_id);
  if v_actor_role is null or v_actor_role not in ('owner','admin') then
    raise exception 'Not authorized to manage this organization' using errcode = '42501';
  end if;
  update public.organizations set updated_at = clock_timestamp() where id = p_organization_id;
  v_actor_role := private.current_org_role(p_organization_id);
  if v_actor_role is null or v_actor_role not in ('owner','admin') then
    raise exception 'Not authorized to manage this organization' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('owner','admin','member')
     or p_status is null or p_status not in ('active','suspended') then
    raise exception 'Invalid membership parameters' using errcode = '22023';
  end if;
  select * into v_target from public.organization_members
    where organization_id = p_organization_id and id = p_member_id for update;
  if not found then
    raise exception 'Membership not accessible' using errcode = '42501';
  end if;
  if v_actor_role = 'admin' and (v_target.role <> 'member' or p_role <> 'member') then
    raise exception 'Admins cannot change elevated roles' using errcode = '42501';
  end if;
  if v_target.role = 'owner' and v_target.status = 'active'
     and (p_role <> 'owner' or p_status <> 'active')
     and not exists (select 1 from public.organization_members
       where organization_id = p_organization_id and role = 'owner'
         and status = 'active' and id <> p_member_id) then
    raise exception 'Cannot demote or suspend the last active owner' using errcode = '23514';
  end if;
  update public.organization_members set role = p_role, status = p_status
    where organization_id = p_organization_id and id = p_member_id;
end;
$$;

revoke all on function public.create_organization(text,text,text,text,text),
  public.add_organization_member(uuid,uuid,text),
  public.update_organization_member(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_organization(text,text,text,text,text),
  public.add_organization_member(uuid,uuid,text),
  public.update_organization_member(uuid,uuid,text,text) to authenticated;

comment on function public.create_organization(text,text,text,text,text) is
  'Step5: atomic organization + owner; requires a real caller JWT; no clinical grants.';
comment on function public.add_organization_member(uuid,uuid,text) is
  'Step5: owner/admin provisions an existing Auth user by UUID; no invitation delivery.';
comment on function public.update_organization_member(uuid,uuid,text,text) is
  'Step5: controlled commercial role/status changes; protects last owner; no clinical escalation.';
comment on table public.member_permissions is
  'Explicit grants. No client-side grant mutations in Step5; clinical governance remains closed.';
comment on table public.audit_events is
  'Append-only operational audit. Read requires audit.read; no default clinical or audit grant.';

notify pgrst, 'reload schema';
