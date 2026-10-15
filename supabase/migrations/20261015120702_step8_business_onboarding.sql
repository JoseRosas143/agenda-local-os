-- Step 8 (Master Build Order): persist the nine-step business setup.
-- Steps 1-2 are already saved by create_organization in Step 5. This RPC
-- advances steps 3-9 without granting clients direct access to progress fields.
-- No clinical role, clinical permission, message, payment, or patient data change.

create function public.save_business_onboarding_step(
  p_organization_id uuid,
  p_step smallint,
  p_value text default null
) returns smallint
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_actor uuid;
  v_profile public.business_profiles%rowtype;
  v_text text := btrim(coalesce(p_value, ''));
begin
  if p_organization_id is null or p_step is null or p_step not between 3 and 9 then
    raise exception 'Invalid onboarding step' using errcode = '22023';
  end if;
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'An authenticated non-anonymous user is required' using errcode = '42501';
  end if;
  if char_length(v_text) > 1000 then
    raise exception 'Onboarding value is too long' using errcode = '22023';
  end if;

  v_role := private.current_org_role(p_organization_id);
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'Not authorized to configure this business' using errcode = '42501';
  end if;

  -- Serialize setup and membership changes on the same parent row, then
  -- re-check authorization after the lock is acquired.
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found or private.current_org_role(p_organization_id) not in ('owner', 'admin') then
    raise exception 'Not authorized to configure this business' using errcode = '42501';
  end if;
  select id into v_actor from public.organization_members
    where organization_id = p_organization_id and user_id = v_user and status = 'active';
  if v_actor is null then
    raise exception 'Active membership is required' using errcode = '42501';
  end if;

  -- Existing organizations may have no profile yet. The parent lock makes
  -- this initialization safe against concurrent setup requests.
  insert into public.business_profiles (organization_id)
    values (p_organization_id)
    on conflict (organization_id) do nothing;
  select * into v_profile from public.business_profiles
    where organization_id = p_organization_id for update;

  if p_step > greatest(v_profile.onboarding_step, 2) + 1 then
    raise exception 'Complete the previous onboarding step first' using errcode = '22023';
  end if;

  case p_step
    when 3 then
      if char_length(v_text) not between 1 and 120 then
        raise exception 'Invalid city' using errcode = '22023';
      end if;
      update public.business_profiles set city = v_text
        where organization_id = p_organization_id;
    when 4 then
      if v_text <> '' or not exists (
        select 1 from public.services
        where organization_id = p_organization_id and active
      ) then
        raise exception 'Add an active service first' using errcode = '22023';
      end if;
    when 5 then
      -- Service prices are stored only in services, never duplicated in the profile.
      -- The user explicitly confirms the catalog prices in this step.
      if v_text <> '' or not exists (
        select 1 from public.services
        where organization_id = p_organization_id and active
      ) then
        raise exception 'Review at least one active service price' using errcode = '22023';
      end if;
    when 6 then
      if char_length(v_text) not between 1 and 500 then
        raise exception 'Invalid ideal customer' using errcode = '22023';
      end if;
      update public.business_profiles set ideal_customer = v_text
        where organization_id = p_organization_id;
    when 7 then
      -- Optional: saving an empty number never implies marketing consent.
      if v_text <> '' and (
        char_length(v_text) > 32 or v_text !~ '^\+?[0-9 ()-]{7,32}$'
        or char_length(regexp_replace(v_text, '[^0-9]', '', 'g')) < 7
      ) then
        raise exception 'Invalid WhatsApp number' using errcode = '22023';
      end if;
      update public.business_profiles set whatsapp_phone = nullif(v_text, '')
        where organization_id = p_organization_id;
    when 8 then
      if v_text not in ('cercano', 'profesional', 'directo', 'empatico') then
        raise exception 'Invalid communication tone' using errcode = '22023';
      end if;
      update public.business_profiles set tone = v_text
        where organization_id = p_organization_id;
    when 9 then
      if v_text not in (
        'agendar_mas_citas', 'captar_clientes',
        'mejorar_seguimiento', 'organizar_operacion'
      ) then
        raise exception 'Invalid primary goal' using errcode = '22023';
      end if;
      if nullif(btrim(coalesce(v_profile.city, '')), '') is null
         or nullif(btrim(coalesce(v_profile.ideal_customer, '')), '') is null
         or coalesce(v_profile.tone, '') not in ('cercano', 'profesional', 'directo', 'empatico')
         or not exists (
           select 1 from public.services
           where organization_id = p_organization_id and active
         ) then
        raise exception 'Business setup is incomplete' using errcode = '22023';
      end if;
      update public.business_profiles
        set primary_goal = v_text,
            onboarding_completed_at = coalesce(onboarding_completed_at, clock_timestamp())
        where organization_id = p_organization_id;
  end case;

  update public.business_profiles
    set onboarding_step = greatest(onboarding_step, p_step)
    where organization_id = p_organization_id;

  insert into public.audit_events (
    organization_id, actor_member_id, actor_kind,
    action, entity_type, entity_id, safe_metadata
  ) values (
    p_organization_id, v_actor, 'member',
    'business.onboarding_step_saved', 'business_profiles', v_profile.id,
    jsonb_build_object('step', p_step, 'completed', p_step = 9)
  );

  return greatest(v_profile.onboarding_step, p_step);
end;
$$;

comment on function public.save_business_onboarding_step(uuid, smallint, text) is
  'Owner/admin-only atomic onboarding progress. Verifies active membership, order, fields and services; audit metadata never contains submitted text.';

revoke all on function public.save_business_onboarding_step(uuid, smallint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_business_onboarding_step(uuid, smallint, text)
  to authenticated;
