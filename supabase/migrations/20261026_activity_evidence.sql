-- Add free-text sub-activity details and private photo evidence for P4P activity logs.
alter table public.logs
  add column if not exists sub_activity text,
  add column if not exists evidence_image_path text;

-- Evidence may contain internal hospital information, so keep the bucket private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('p4p-evidence', 'p4p-evidence', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists p4p_evidence_insert on storage.objects;
create policy p4p_evidence_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'p4p-evidence'
  and exists (
    select 1 from public.people p
    where p.id::text = (storage.foldername(name))[1]
      and (
        p.user_id = auth.uid()
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
    where p.id::text = (storage.foldername(name))[1]
      and (
        public.my_role() in ('admin', 'committee')
        or p.user_id = auth.uid()
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
    where p.id::text = (storage.foldername(name))[1]
      and (
        p.user_id = auth.uid()
        or public.my_role() = 'admin'
        or (public.my_role() = 'head' and p.unit_id = public.my_unit())
      )
  )
);
