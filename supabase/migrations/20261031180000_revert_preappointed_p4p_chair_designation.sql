-- Revert the pre-appointed chair mechanism. The committee candidate list
-- will show the staff member from staff_directory instead.
drop trigger if exists trg_p4p_link_preappointed_chair on public.profiles;
drop function if exists public.p4p_link_preappointed_chair();
drop table if exists public.p4p_committee_designations;
