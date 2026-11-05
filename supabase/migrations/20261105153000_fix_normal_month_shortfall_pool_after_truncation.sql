DO $migration$
DECLARE
  v_def text;
  v_old text := 'below_difference := trunc((a - fixed_amount) * n_below, 2);';
  v_new text := 'below_difference := trunc(((CASE WHEN is_october THEN a ELSE s END) - fixed_amount) * n_below, 2);';
BEGIN
  SELECT pg_get_functiondef(
    'public.p4p_alloc(public.pay_groups,jsonb,numeric,numeric,date)'::regprocedure
  ) INTO v_def;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'ไม่พบสูตรส่วนต่างเดิมใน p4p_alloc; ยกเลิก migration';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$migration$;
