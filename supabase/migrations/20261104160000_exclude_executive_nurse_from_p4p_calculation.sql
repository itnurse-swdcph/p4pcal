-- Exclude the acting chief nurse (staff_directory source_row 2) from P4P activity entry and payout.
-- The executive's approval responsibilities remain unchanged.
DO $migration$
DECLARE
  calc_def text := pg_get_functiondef('public.p4p_calc(date)'::regprocedure);
  payout_def text := pg_get_functiondef('public.p4p_my_payout(date)'::regprocedure);
  write_def text := pg_get_functiondef('public.can_write_person(uuid)'::regprocedure);
BEGIN
  IF position('where d.active and pos.pay_group = g.id;' in calc_def) = 0 THEN
    RAISE EXCEPTION 'Expected p4p_calc filter was not found';
  END IF;
  calc_def := replace(calc_def, 'where d.active and pos.pay_group = g.id;', 'where d.active and pos.pay_group = g.id and d.source_row <> 2;');
  EXECUTE calc_def;

  IF position('where p.id = pid and (' in write_def) = 0 THEN
    RAISE EXCEPTION 'Expected can_write_person predicate was not found';
  END IF;
  write_def := replace(write_def, 'where p.id = pid and (', 'where p.id = pid and coalesce(p.staff_directory_id, sd.source_row) <> 2 and (');
  EXECUTE write_def;

  IF position('select id into person_id from public.people' in payout_def) = 0 THEN
    RAISE EXCEPTION 'Expected p4p_my_payout lookup was not found';
  END IF;
  payout_def := replace(payout_def,
    '  select id into person_id from public.people',
    E'  if exists (select 1 from public.profiles where user_id = auth.uid() and staff_directory_id = 2) then\n    return jsonb_build_object(''closed'', true, ''payout_available'', false, ''excluded_reason'', ''executive_role'');\n  end if;\n\n  select id into person_id from public.people');
  EXECUTE payout_def;
END
$migration$;
