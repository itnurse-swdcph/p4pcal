-- 1) หัวหน้าที่ดูแลหลายหน่วย/หัวหน้ากลุ่มงาน เปิดดู-อัปโหลดรูปหลักฐานของทุกหน่วยที่ตนดูแลได้ (เดิมใช้ my_unit() หน่วยเดียว)
drop policy if exists p4p_evidence_insert on storage.objects;
create policy p4p_evidence_insert on storage.objects for insert to authenticated
with check (bucket_id = 'p4p-evidence' and exists (
  select 1 from public.people p where p.id::text = (storage.foldername(objects.name))[1]
    and (p.user_id = (select auth.uid()) or public.my_role() = 'admin'
         or (public.my_role() = 'head' and p.unit_id in (select public.my_units())))));
drop policy if exists p4p_evidence_select on storage.objects;
create policy p4p_evidence_select on storage.objects for select to authenticated
using (bucket_id = 'p4p-evidence' and exists (
  select 1 from public.people p where p.id::text = (storage.foldername(objects.name))[1]
    and (public.my_role() in ('admin','committee') or p.user_id = (select auth.uid())
         or (public.my_role() = 'head' and p.unit_id in (select public.my_units())))));
drop policy if exists p4p_evidence_delete on storage.objects;
create policy p4p_evidence_delete on storage.objects for delete to authenticated
using (bucket_id = 'p4p-evidence' and exists (
  select 1 from public.people p where p.id::text = (storage.foldername(objects.name))[1]
    and (p.user_id = (select auth.uid()) or public.my_role() = 'admin'
         or (public.my_role() = 'head' and p.unit_id in (select public.my_units())))));

-- 2) หัวหน้างานของหน่วยงาน สำหรับพิมพ์ในใบสรุปผลงาน P4P รายบุคคล
create or replace function public.unit_head(p_unit int)
returns table(head_name text, head_position text)
language sql stable security definer set search_path = public as $$
  select h.n, h.pos from (
    select p.full_name n, p.position pos, 1 pri from profiles p
      where p.role = 'head' and p.unit_id = p_unit and p.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน'
    union all select p.full_name, p.position, 2 from profiles p where p.role = 'head' and p.unit_id = p_unit
    union all select p.full_name, p.position, 3 from profiles p
      join profile_units pu on pu.user_id = p.user_id and pu.unit_id = p_unit and pu.approved where p.role = 'head'
    union all select p.full_name, p.position, 4 from profiles p
      join units b on b.id = p.unit_id join units t on t.id = p_unit and t.parent_group = b.parent_group
      where p.role = 'head' and p.position = 'หัวหน้ากลุ่มงานการพยาบาล'
  ) h order by h.pri, h.n limit 1 $$;
revoke execute on function public.unit_head(int) from public, anon;
grant execute on function public.unit_head(int) to authenticated;
