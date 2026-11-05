-- p4p_review_unit / p4p_unreview_unit ตรวจสิทธิ์ด้วย my_role() = 'committee' ซึ่งไม่มีบัญชีใดมี role นี้
-- (กรรมการทุกคนมี role = 'admin' และอยู่ใน p4p_committee_members) ทำให้ปุ่ม "ตรวจแล้ว" ใช้ไม่ได้
-- ใช้เงื่อนไขเดียวกับ p4p_committee_audit_activity: กรรมการที่ปฏิบัติหน้าที่ (active) หรือ admin 11450

create or replace function public.p4p_can_act_as_committee()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select auth.uid() is not null and (
    (public.my_role() = 'committee' and public.p4p_is_committee_member())
    or (public.my_role() = 'admin' and (
          exists (select 1 from public.profiles pr where pr.user_id = auth.uid() and pr.username = '11450')
          or exists (select 1 from public.p4p_committee_members cm where cm.user_id = auth.uid() and cm.active)
       ))
  );
$function$;

revoke all on function public.p4p_can_act_as_committee() from public, anon;
grant execute on function public.p4p_can_act_as_committee() to authenticated;

do $patch$
declare
  fn text; d text;
  old_cond text := 'auth.uid() is null or public.my_role() <> ''committee'' or not public.p4p_is_committee_member()';
  new_cond text := 'not public.p4p_can_act_as_committee()';
begin
  foreach fn in array array['public.p4p_review_unit(uuid)', 'public.p4p_unreview_unit(uuid)'] loop
    d := pg_get_functiondef(fn::regprocedure);
    if position(old_cond in d) > 0 then
      execute replace(d, old_cond, new_cond);
    elsif position('p4p_can_act_as_committee' in d) = 0 then
      raise exception '% changed: condition not found, patch not applied', fn;
    end if;
  end loop;
end $patch$;
