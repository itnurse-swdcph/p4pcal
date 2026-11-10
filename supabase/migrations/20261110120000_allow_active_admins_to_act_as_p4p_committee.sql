-- Active P4P committee appointments are authoritative, including staff whose
-- application profile retains the admin role for other administrative duties.
-- Do not rewrite profiles.role: that would remove existing admin capabilities.

create or replace function public.p4p_is_committee_member()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.p4p_committee_members m
    where m.user_id = auth.uid() and m.active
  );
$function$;

create or replace function public.p4p_is_committee_chair()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.p4p_committee_members m
    where m.user_id = auth.uid() and m.active and m.is_chair
  );
$function$;

-- Align starting a review, voting, and closing a period with the same
-- active-appointment rule used by the committee roster.
do $$
declare
  fn regprocedure;
  src text;
  changed text;
  old_guard text := 'auth.uid() is null or public.my_role()<>''committee'' or not public.p4p_is_committee_member()';
  old_roster text := 'where active and user_id in(select user_id from public.profiles where role=''committee'')';
begin
  foreach fn in array array[
    'public.p4p_start_review(date)'::regprocedure,
    'public.p4p_review_vote(date,text,text)'::regprocedure,
    'public.p4p_close(date)'::regprocedure
  ] loop
    src := pg_get_functiondef(fn);
    changed := replace(src, old_guard, 'auth.uid() is null or not public.p4p_is_committee_member()');
    changed := replace(changed, old_roster, 'where active');
    if changed <> src then
      execute changed;
    elsif position('auth.uid() is null or not public.p4p_is_committee_member()' in src) = 0
       or position('from public.p4p_committee_members where active;' in src) = 0 then
      raise exception 'Unexpected committee authorization definition in %', fn;
    end if;
  end loop;
end $$;
