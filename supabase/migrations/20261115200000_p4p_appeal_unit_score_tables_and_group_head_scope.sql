-- Enrich appeal dashboard with the published score snapshot and accept blank sub-unit names for group heads.
CREATE OR REPLACE FUNCTION public.p4p_appeal_dashboard(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_admin boolean:=public.p4p_is_appeal_admin();
  v_role text;
  v_people jsonb;
  v_appeals jsonb;
  v_snapshot_lines jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  if p_month is null then raise exception 'กรุณาระบุเดือน'; end if;
  select role into v_role from public.profiles where user_id=auth.uid();
  select coalesce(result->'lines','[]'::jsonb) into v_snapshot_lines
    from public.p4p_closed_months where month=date_trunc('month',p_month)::date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'staff_directory_id',p.staff_directory_id,'person_id',p.id,'name',p.name,
    'position',p.position,'unit_id',p.unit_id,
    'unit_name',coalesce(u.name,nullif(trim(d.unit_name),''),nullif(trim(d.nursing_group),''),'หัวหน้ากลุ่มงานไม่สังกัดหน่วยงานย่อย'),
    'group_name',d.nursing_group,'org_role',d.org_role
  ) order by p.name),'[]'::jsonb) into v_people
  from public.people p
  left join public.units u on u.id=p.unit_id
  left join public.staff_directory d on d.source_row=p.staff_directory_id
  where p.active=true and p.staff_directory_id is not null
    and (v_admin or (v_role in ('head','group_head') and public.can_approve_person(p.id)) or p.user_id=auth.uid());

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'month',a.month,'scope_type',a.scope_type,'unit_id',a.unit_id,
    'unit_name',case when a.unit_id is not null then u.name
      when (select count(*) from public.p4p_appeal_people ap where ap.appeal_id=a.id)>1 then 'หลายหน่วยงาน/กลุ่มงาน'
      else coalesce((select coalesce(un.name,nullif(trim(sd.unit_name),''),nullif(trim(sd.nursing_group),''),'หัวหน้ากลุ่มงานไม่สังกัดหน่วยงานย่อย')
        from public.p4p_appeal_people ap
        join public.people pp on pp.id=ap.person_id
        left join public.units un on un.id=pp.unit_id
        left join public.staff_directory sd on sd.source_row=pp.staff_directory_id
        where ap.appeal_id=a.id order by pp.name limit 1),'ไม่ระบุหน่วยงาน') end,
    'reason',a.reason,'details',a.details,'status',a.status,
    'submitter_name',a.submitter_name,'created_at',a.created_at,'expires_at',a.expires_at,
    'reviewer_name',a.reviewer_name,'review_comment',a.review_comment,
    'people',coalesce((select jsonb_agg(jsonb_build_object(
      'staff_directory_id',ap.staff_directory_id,'person_id',ap.person_id,'name',p.name,
      'position',p.position,
      'unit_name',coalesce(un.name,nullif(trim(sd.unit_name),''),nullif(trim(sd.nursing_group),''),'หัวหน้ากลุ่มงานไม่สังกัดหน่วยงานย่อย'),
      'insurance_points',coalesce((select nullif(x->>'guarantee','')::numeric from jsonb_array_elements(v_snapshot_lines) x
        where nullif(x->>'staff_directory_id','')::integer=ap.staff_directory_id limit 1),0),
      'role_points',case
        when (coalesce((select nullif(x->>'pay_group','')::integer from jsonb_array_elements(v_snapshot_lines) x
          where nullif(x->>'staff_directory_id','')::integer=ap.staff_directory_id limit 1),0)=1
          or p.position ilike '%พยาบาลวิชาชีพ%')
          and (coalesce(sd.org_role,'')||' '||coalesce(p.position,'')) ilike '%หัวหน้ากลุ่มงาน%' then 240
        when (coalesce((select nullif(x->>'pay_group','')::integer from jsonb_array_elements(v_snapshot_lines) x
          where nullif(x->>'staff_directory_id','')::integer=ap.staff_directory_id limit 1),0)=1
          or p.position ilike '%พยาบาลวิชาชีพ%')
          and (coalesce(sd.org_role,'')||' '||coalesce(p.position,'')) ilike '%หัวหน้างาน%' then 120
        else 0 end,
      'performance_points',coalesce((select nullif(x->>'counted','')::numeric from jsonb_array_elements(v_snapshot_lines) x
        where nullif(x->>'staff_directory_id','')::integer=ap.staff_directory_id limit 1),0)
    ) order by p.name) from public.p4p_appeal_people ap
      join public.people p on p.id=ap.person_id
      left join public.units un on un.id=p.unit_id
      left join public.staff_directory sd on sd.source_row=p.staff_directory_id
      where ap.appeal_id=a.id),'[]'::jsonb)
  ) order by a.created_at desc),'[]'::jsonb) into v_appeals
  from public.p4p_appeals a left join public.units u on u.id=a.unit_id
  where a.month=date_trunc('month',p_month)::date
    and (v_admin or v_role='committee' or a.submitted_by=auth.uid()
      or exists(select 1 from public.p4p_appeal_people ap join public.people p on p.id=ap.person_id
        where ap.appeal_id=a.id and p.user_id=auth.uid()));

  return jsonb_build_object('is_admin',v_admin,'role',v_role,
    'month_closed',exists(select 1 from public.p4p_closed_months c where c.month=date_trunc('month',p_month)::date),
    'staff',v_people,'appeals',v_appeals);
end;
$function$;

REVOKE ALL ON FUNCTION public.p4p_appeal_dashboard(date) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.p4p_appeal_dashboard(date) TO authenticated;

-- Preserve the current create-appeal workflow, but treat empty/whitespace unit_name as no sub-unit.
DO $patch$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.p4p_create_appeal(date,integer[],text,text,boolean,integer)'::regprocedure) INTO v_def;
  v_def := replace(v_def, 'd.unit_name is null', 'nullif(trim(d.unit_name), '''') is null');
  EXECUTE v_def;
END
$patch$;
