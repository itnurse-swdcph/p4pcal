drop policy if exists p4p_payment_memos_select on public.p4p_payment_memos;
create policy p4p_payment_memos_select on public.p4p_payment_memos
for select to authenticated
using (
  created_by = auth.uid()
  or public.my_role() = 'admin'
  or unit_id in (select public.my_units())
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'group_head'
      and p.nursing_group = group_name
  )
);

drop policy if exists p4p_payment_memos_insert on public.p4p_payment_memos;
create policy p4p_payment_memos_insert on public.p4p_payment_memos
for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    (public.my_role() = 'admin')
    or (public.my_role() = 'head' and unit_id in (select public.my_units()))
    or (
      public.my_role() = 'group_head'
      and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid()
          and p.role = 'group_head'
          and p.nursing_group = group_name
      )
    )
  )
);

drop policy if exists p4p_payment_memos_update on public.p4p_payment_memos;
create policy p4p_payment_memos_update on public.p4p_payment_memos
for update to authenticated
using (
  public.my_role() = 'admin'
  or (created_by = auth.uid() and unit_id in (select public.my_units()))
  or (
    created_by = auth.uid()
    and public.my_role() = 'group_head'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'group_head'
        and p.nursing_group = group_name
    )
  )
)
with check (
  public.my_role() = 'admin'
  or (created_by = auth.uid() and unit_id in (select public.my_units()))
  or (
    created_by = auth.uid()
    and public.my_role() = 'group_head'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'group_head'
        and p.nursing_group = group_name
    )
  )
);
