-- Fix P4P evidence Storage RLS: qualify the outer storage.objects.name.
-- Without the qualification, name inside the EXISTS subquery resolves to people.name,
-- so valid upload paths never match the person's UUID folder.
drop policy if exists p4p_evidence_insert on storage.objects;
create policy p4p_evidence_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'p4p-evidence'
  and exists (
    select 1 from public.people p
    where p.id::text = (storage.foldername(objects.name))[1]
      and (
        p.user_id = (select auth.uid())
        or public.my_role() = 'admin'
        or (public.my_role() = 'head' and p.unit_id = public.my_unit())
      )
  )
);

drop policy if exists p4p_evidence_select on storage.objects;
create policy p4p_evidence_select
on storage.objects for select to authenticated
using (
  bucket_id = 'p4p-evidence'
  and exists (
    select 1 from public.people p
    where p.id::text = (storage.foldername(objects.name))[1]
      and (
        public.my_role() in ('admin', 'committee')
        or p.user_id = (select auth.uid())
        or (public.my_role() = 'head' and p.unit_id = public.my_unit())
      )
  )
);

drop policy if exists p4p_evidence_delete on storage.objects;
create policy p4p_evidence_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'p4p-evidence'
  and exists (
    select 1 from public.people p
    where p.id::text = (storage.foldername(objects.name))[1]
      and (
        p.user_id = (select auth.uid())
        or public.my_role() = 'admin'
        or (public.my_role() = 'head' and p.unit_id = public.my_unit())
      )
  )
);
