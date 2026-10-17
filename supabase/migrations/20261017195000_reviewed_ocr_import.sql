-- Additive migration. Existing projects and manual creation remain unchanged.
begin;

alter table public.addresses add column if not exists ai_scan jsonb;
alter table public.addresses add column if not exists ai_import_key uuid;
alter table public.addresses add column if not exists ai_import_user uuid;
alter table public.work_types add column if not exists ai_source jsonb;
create unique index if not exists addresses_ai_import_key_idx
  on public.addresses (ai_import_user, ai_import_key) where ai_import_key is not null;

-- Per-user budget, shared across Edge Function instances. No document contents.
create table if not exists public.ocr_usage_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  pages integer not null default 0,
  primary key (user_id, window_start)
);
alter table public.ocr_usage_windows enable row level security;
revoke all on public.ocr_usage_windows from public, anon, authenticated;

create or replace function public.consume_ocr_budget(p_pages integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_window timestamptz := date_trunc('hour', now());
  v_pages integer;
begin
  if v_user is null or not exists (select 1 from public.profiles where id = v_user and role = 'admin') then
    raise exception 'Only administrators can scan work orders.' using errcode = '42501';
  end if;
  if p_pages < 1 or p_pages > 11 or p_pages is null then
    raise exception 'Invalid page count.' using errcode = '22023';
  end if;
  insert into public.ocr_usage_windows(user_id, window_start, pages)
    values (v_user, v_window, p_pages)
    on conflict (user_id, window_start) do update
      set pages = public.ocr_usage_windows.pages + excluded.pages
      where public.ocr_usage_windows.pages + excluded.pages <= 100
    returning pages into v_pages;
  delete from public.ocr_usage_windows where user_id = v_user and window_start < now() - interval '2 days';
  return v_pages is not null;
end;
$$;
revoke all on function public.consume_ocr_budget(integer) from public, anon;
grant execute on function public.consume_ocr_budget(integer) to authenticated;

create or replace function public.import_reviewed_work_order(
  p_project jsonb, p_scan jsonb, p_import_key uuid, p_allow_duplicate boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_address public.addresses%rowtype;
  v_project public.addresses%rowtype;
  v_template_id public.work_type_templates.id%type;
  v_row jsonb;
  v_amount numeric;
  v_name text;
  v_count integer := 0;
  v_matches integer;
begin
  if v_user is null or not exists (select 1 from public.profiles where id = v_user and role = 'admin') then
    raise exception 'Only administrators can import work orders.' using errcode = '42501';
  end if;
  if p_import_key is null or p_scan is null or p_project is null
     or p_scan->>'reviewed' is distinct from 'true'
     or p_scan->'original'->>'schema_version' is distinct from '4.0'
     or jsonb_typeof(p_scan->'reviewed_rows') is distinct from 'array' then
    raise exception 'A reviewed scan and import key are required.' using errcode = '22023';
  end if;
  if pg_column_size(p_scan) > 4000000 or jsonb_array_length(p_scan->'reviewed_rows') > 2500 then
    raise exception 'Scan payload exceeds the import limit.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_import_key::text, 0));
  select * into v_address from public.addresses where ai_import_user = v_user and ai_import_key = p_import_key;
  if found then return jsonb_build_object('id', v_address.id, 'already_imported', true); end if;

  -- Convert only supported project fields using the database's actual types.
  select * into v_project from jsonb_populate_record(null::public.addresses, jsonb_build_object(
    'address', trim(p_project->>'address'),
    'work_order_number', nullif(trim(p_project->>'work_order_number'), ''),
    'date', p_project->>'date',
    'total_amount', p_project->'total_amount',
    'store_id', p_project->'store_id',
    'builder_id', p_project->'builder_id',
    'project_type', p_project->>'project_type',
    'service_time', p_project->>'service_time',
    'original_photo_url', p_project->>'original_photo_url',
    'ai_translation', p_project->>'ai_translation',
    'files', p_project->'files'
  ));
  if coalesce(length(v_project.address), 0) < 3 or v_project.date is null
     or v_project.project_type is null or v_project.project_type not in ('Address', 'Service') then
    raise exception 'Address, installation date and project type are required.' using errcode = '22023';
  end if;
  if v_project.project_type = 'Service' and v_project.service_time is null then
    raise exception 'Service time is required.' using errcode = '22023';
  end if;
  if nullif(p_scan->>'date_end', '')::date < v_project.date::date then
    raise exception 'End date is before start date.' using errcode = '22023';
  end if;
  if abs(v_project.total_amount) > 1000000000 then raise exception 'Invalid project amount.' using errcode = '22023'; end if;
  if v_project.work_order_number is not null then
    perform pg_advisory_xact_lock(hashtextextended('ocr-order:' || v_project.work_order_number, 0));
    if not coalesce(p_allow_duplicate, false) and exists (
      select 1 from public.addresses where work_order_number = v_project.work_order_number and is_deleted = false
    ) then raise exception 'This work order already exists. Review the duplicate before importing.' using errcode = '23505'; end if;
  end if;

  insert into public.addresses(address, work_order_number, date, total_amount, store_id, builder_id,
    status, project_type, service_time, original_photo_url, ai_translation, files, ai_scan, ai_import_key, ai_import_user)
  values (v_project.address, v_project.work_order_number, v_project.date, v_project.total_amount,
    v_project.store_id, v_project.builder_id, 'In Process', v_project.project_type, v_project.service_time,
    v_project.original_photo_url, v_project.ai_translation, v_project.files,
    p_scan || jsonb_build_object('reviewed_by', v_user, 'reviewed_at', now()), p_import_key, v_user)
  returning * into v_address;

  for v_row in select value from jsonb_array_elements(p_scan->'reviewed_rows') loop
    if coalesce(v_row->>'import_as_work', 'false') <> 'true' then continue; end if;
    if v_row->>'category' is distinct from 'labor' then
      raise exception 'Only labor rows can be imported as work.' using errcode = '22023';
    end if;
    v_name := trim(v_row->>'name');
    if coalesce(length(v_name), 0) = 0 or length(v_name) > 500 then raise exception 'Invalid work name.' using errcode = '22023'; end if;
    v_amount := nullif(v_row->>'amount', '')::numeric;
    if abs(v_amount) > 1000000000 or v_amount::text in ('NaN', 'Infinity', '-Infinity') then raise exception 'Invalid work amount.' using errcode = '22023'; end if;
    v_template_id := null;
    if nullif(v_row->>'template_id', '') is not null then
      select id into v_template_id from public.work_type_templates where id::text = v_row->>'template_id';
      if not found then raise exception 'Selected work type no longer exists.' using errcode = '22023'; end if;
    else
      perform pg_advisory_xact_lock(hashtextextended('ocr-template:' || lower(v_name), 0));
      select count(*) into v_matches from public.work_type_templates where lower(trim(name)) = lower(v_name);
      if v_matches > 1 then raise exception 'Multiple work types have this name. Select one explicitly.' using errcode = '22023'; end if;
      select id into v_template_id from public.work_type_templates where lower(trim(name)) = lower(v_name);
      if not found then insert into public.work_type_templates(name) values(v_name) returning id into v_template_id; end if;
    end if;
    insert into public.work_types(address_id, work_type_template_id, payment_amount, person_id, notes, ai_source)
      values(v_address.id, v_template_id, v_amount, null, nullif(v_row->>'notes', ''), v_row);
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('id', v_address.id, 'work_items', v_count, 'already_imported', false);
end;
$$;
revoke all on function public.import_reviewed_work_order(jsonb, jsonb, uuid, boolean) from public, anon;
grant execute on function public.import_reviewed_work_order(jsonb, jsonb, uuid, boolean) to authenticated;
commit;
