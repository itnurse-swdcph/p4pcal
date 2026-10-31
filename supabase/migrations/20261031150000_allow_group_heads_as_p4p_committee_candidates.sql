CREATE OR REPLACE FUNCTION public.p4p_set_committee_member(
  p_user_id uuid,
  p_active boolean,
  p_is_chair boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  target_role text;
  target_org_role text;
begin
  if auth.uid() is null or public.my_role() <> 'admin' then
    raise exception 'เฉพาะผู้ดูแลระบบจัดการรายชื่อกรรมการได้';
  end if;
  if p_user_id is null then
    raise exception 'กรุณาเลือกบัญชีกรรมการ';
  end if;
  if p_is_chair and not p_active then
    raise exception 'ประธานต้องเป็นกรรมการที่ปฏิบัติหน้าที่';
  end if;

  select role, org_role
    into target_role, target_org_role
    from public.profiles
   where user_id = p_user_id;

  if target_role is null then
    raise exception 'ไม่พบบัญชีบุคลากรที่เลือก';
  end if;

  if target_org_role is distinct from 'หัวหน้ากลุ่มงาน'
     and target_role is distinct from 'committee' then
    raise exception 'เลือกได้เฉพาะบุคลากรตำแหน่งหัวหน้ากลุ่มงานหรือบัญชีกรรมการ P4P เดิม';
  end if;

  if p_is_chair then
    update public.p4p_committee_members
       set is_chair = false, updated_at = now()
     where active and is_chair and user_id <> p_user_id;
  end if;

  insert into public.p4p_committee_members(user_id, active, is_chair, appointed_by, updated_at)
  values (p_user_id, p_active, p_is_chair, auth.uid(), now())
  on conflict (user_id) do update
    set active = excluded.active,
        is_chair = excluded.is_chair,
        appointed_by = case when excluded.active then auth.uid() else p4p_committee_members.appointed_by end,
        updated_at = now();

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'active', p_active, 'is_chair', p_is_chair);
end;
$function$;
