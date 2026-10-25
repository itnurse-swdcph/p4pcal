-- Allow nursing supervisors to self-register additional units without an admin approval step.
-- Additional units are only self-approved for the two supervisor position names used by this app.
drop policy if exists pu_self_ins on public.profile_units;

create policy pu_self_ins
on public.profile_units
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (
    approved = false
    or (
      approved = true
      and exists (
        select 1
        from public.profiles p
        where p.user_id = (select auth.uid())
          and p.position in ('หัวหน้ากลุ่มงานการพยาบาล', 'หัวหน้าหอผู้ป่วย/หัวหน้างาน')
      )
    )
  )
);
