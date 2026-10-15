-- Step 7: tenant-isolated business and CRM foundation. Apply only after Step 5.
-- No clinical records, data migration, seed data, or destructive statements.
-- CRM workflow tables are deliberately read-only to clients until audited,
-- atomic write APIs and consent rules are implemented.

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  city text,
  ideal_customer text,
  whatsapp_phone text,
  tone text,
  primary_goal text,
  onboarding_step smallint not null default 0 check (onboarding_step between 0 and 9),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_profiles_org_unique unique (organization_id),
  constraint business_profiles_org_id_unique unique (organization_id,id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (char_length(btrim(code)) between 1 and 80),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text,
  price numeric(14,2) not null default 0 check (price >= 0),
  duration_minutes integer check (duration_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_org_code_unique unique (organization_id,code),
  constraint services_org_id_unique unique (organization_id,id)
);
create index services_active_name_idx on public.services(organization_id,active,name);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  email text,
  phone text,
  source text,
  customer_since timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_org_id_unique unique (organization_id,id)
);
create index contacts_recent_idx on public.contacts(organization_id,created_at desc,id);
create index contacts_email_idx on public.contacts(organization_id,lower(email));
create index contacts_phone_idx on public.contacts(organization_id,phone);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  stage_key text not null check (char_length(btrim(stage_key)) between 1 and 80),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  position integer not null check (position >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pipeline_stages_org_key_unique unique (organization_id,stage_key),
  constraint pipeline_stages_org_position_unique unique (organization_id,position) deferrable,
  constraint pipeline_stages_org_id_unique unique (organization_id,id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  stage_id uuid not null,
  service_id uuid,
  assigned_member_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  source text,
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  status text not null default 'open' check (status in ('open','won','lost')),
  converted_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_org_id_unique unique (organization_id,id),
  constraint leads_org_contact_id_unique unique (organization_id,contact_id,id),
  constraint leads_contact_fk foreign key (organization_id,contact_id)
    references public.contacts(organization_id,id) on delete restrict,
  constraint leads_stage_fk foreign key (organization_id,stage_id)
    references public.pipeline_stages(organization_id,id) on delete restrict,
  constraint leads_service_fk foreign key (organization_id,service_id)
    references public.services(organization_id,id) on delete restrict,
  constraint leads_assignee_fk foreign key (organization_id,assigned_member_id)
    references public.organization_members(organization_id,id) on delete restrict
);
create index leads_stage_recent_idx on public.leads(organization_id,stage_id,created_at desc,id);
create index leads_assignee_status_idx on public.leads(organization_id,assigned_member_id,status);
create index leads_service_idx on public.leads(organization_id,service_id) where service_id is not null;

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  lead_id uuid,
  actor_member_id uuid,
  kind text not null check (kind in ('administrative_note','call','message','stage_change','conversion')),
  body text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint activities_org_id_unique unique (organization_id,id),
  constraint activities_contact_fk foreign key (organization_id,contact_id)
    references public.contacts(organization_id,id) on delete restrict,
  constraint activities_lead_fk foreign key (organization_id,contact_id,lead_id)
    references public.leads(organization_id,contact_id,id) on delete restrict,
  constraint activities_actor_fk foreign key (organization_id,actor_member_id)
    references public.organization_members(organization_id,id) on delete restrict
);
create index activities_contact_time_idx on public.activities(organization_id,contact_id,occurred_at desc,id);
create index activities_lead_idx on public.activities(organization_id,contact_id,lead_id) where lead_id is not null;
create index activities_actor_idx on public.activities(organization_id,actor_member_id) where actor_member_id is not null;

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  lead_id uuid,
  assigned_member_id uuid,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  result text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint followups_org_id_unique unique (organization_id,id),
  constraint followups_contact_fk foreign key (organization_id,contact_id)
    references public.contacts(organization_id,id) on delete restrict,
  constraint followups_lead_fk foreign key (organization_id,contact_id,lead_id)
    references public.leads(organization_id,contact_id,id) on delete restrict,
  constraint followups_assignee_fk foreign key (organization_id,assigned_member_id)
    references public.organization_members(organization_id,id) on delete restrict,
  constraint followups_completion_check check (
    status <> 'completed' or
    (completed_at is not null and result is not null and btrim(result) <> '')
  )
);
create index followups_pending_due_idx on public.followups(organization_id,due_at,id) where status = 'pending';
create index followups_contact_idx on public.followups(organization_id,contact_id,id);
create index followups_lead_idx on public.followups(organization_id,contact_id,lead_id) where lead_id is not null;
create index followups_assignee_idx on public.followups(organization_id,assigned_member_id) where assigned_member_id is not null;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  lead_id uuid,
  assigned_member_id uuid,
  service_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','confirmed','completed','cancelled','no_show')),
  administrative_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_time_check check (ends_at > starts_at),
  constraint appointments_org_id_unique unique (organization_id,id),
  constraint appointments_org_contact_id_unique unique (organization_id,contact_id,id),
  constraint appointments_contact_fk foreign key (organization_id,contact_id)
    references public.contacts(organization_id,id) on delete restrict,
  constraint appointments_lead_fk foreign key (organization_id,contact_id,lead_id)
    references public.leads(organization_id,contact_id,id) on delete restrict,
  constraint appointments_assignee_fk foreign key (organization_id,assigned_member_id)
    references public.organization_members(organization_id,id) on delete restrict,
  constraint appointments_service_fk foreign key (organization_id,service_id)
    references public.services(organization_id,id) on delete restrict
);
create index appointments_start_idx on public.appointments(organization_id,starts_at,id);
create index appointments_contact_start_idx on public.appointments(organization_id,contact_id,starts_at desc);
create index appointments_assignee_start_idx on public.appointments(organization_id,assigned_member_id,starts_at);
create index appointments_lead_idx on public.appointments(organization_id,contact_id,lead_id) where lead_id is not null;
create index appointments_service_idx on public.appointments(organization_id,service_id) where service_id is not null;

create table public.communication_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  channel text not null check (channel in ('email','whatsapp','sms','phone')),
  preference text not null default 'unknown'
    check (preference in ('unknown','opted_in','opted_out')),
  source text not null check (char_length(btrim(source)) between 1 and 160),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_preferences_org_id_unique unique (organization_id,id),
  constraint communication_preferences_contact_channel_unique unique (organization_id,contact_id,channel),
  constraint communication_preferences_contact_fk foreign key (organization_id,contact_id)
    references public.contacts(organization_id,id) on delete restrict
);

-- Every new exposed relation starts with RLS and an explicit grant model.
do $step7$
declare t text;
begin
  foreach t in array array[
    'business_profiles','services','contacts','pipeline_stages','leads',
    'activities','followups','appointments','communication_preferences'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.current_org_role(organization_id) is not null)',
      t || '_tenant_read', t
    );
  end loop;
end
$step7$;

-- The first three entities can be maintained by active owners/admins.
-- Column grants exclude tenant IDs, primary keys and server-managed timestamps.
grant insert (organization_id,city,ideal_customer,whatsapp_phone,tone,primary_goal)
  on public.business_profiles to authenticated;
grant update (city,ideal_customer,whatsapp_phone,tone,primary_goal)
  on public.business_profiles to authenticated;
grant insert (organization_id,code,name,description,price,duration_minutes,active)
  on public.services to authenticated;
grant update (code,name,description,price,duration_minutes,active)
  on public.services to authenticated;
grant insert (organization_id,display_name,email,phone,source)
  on public.contacts to authenticated;
grant update (display_name,email,phone,source,archived_at)
  on public.contacts to authenticated;

create policy business_profiles_admin_insert on public.business_profiles
  for insert to authenticated with check (private.current_org_role(organization_id) in ('owner','admin'));
create policy business_profiles_admin_update on public.business_profiles
  for update to authenticated
  using (private.current_org_role(organization_id) in ('owner','admin'))
  with check (private.current_org_role(organization_id) in ('owner','admin'));
create policy services_admin_insert on public.services
  for insert to authenticated with check (private.current_org_role(organization_id) in ('owner','admin'));
create policy services_admin_update on public.services
  for update to authenticated
  using (private.current_org_role(organization_id) in ('owner','admin'))
  with check (private.current_org_role(organization_id) in ('owner','admin'));
create policy contacts_admin_insert on public.contacts
  for insert to authenticated with check (private.current_org_role(organization_id) in ('owner','admin'));
create policy contacts_admin_update on public.contacts
  for update to authenticated
  using (private.current_org_role(organization_id) in ('owner','admin'))
  with check (private.current_org_role(organization_id) in ('owner','admin'));

-- Defense in depth: privileged future APIs cannot silently transfer a row
-- between organizations or alter its creation timestamp.
create function private.guard_core_business_identity()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Business row identity is immutable' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.guard_core_business_identity() from public, anon, authenticated, service_role;

create trigger business_profiles_guard before update on public.business_profiles
  for each row execute function private.guard_core_business_identity();
create trigger services_guard before update on public.services
  for each row execute function private.guard_core_business_identity();
create trigger contacts_guard before update on public.contacts
  for each row execute function private.guard_core_business_identity();
create trigger pipeline_stages_guard before update on public.pipeline_stages
  for each row execute function private.guard_core_business_identity();
create trigger leads_guard before update on public.leads
  for each row execute function private.guard_core_business_identity();
create trigger followups_guard before update on public.followups
  for each row execute function private.guard_core_business_identity();
create trigger appointments_guard before update on public.appointments
  for each row execute function private.guard_core_business_identity();
create trigger communication_preferences_guard before update on public.communication_preferences
  for each row execute function private.guard_core_business_identity();
