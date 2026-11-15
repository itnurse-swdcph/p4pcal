do $$
declare
  fn text;
  old_block text := $old$
        when m = DATE '2026-10-01' then case
          when coalesce(d.org_role, '') ilike '%หัวหน้า%' or d.position in ('หัวหน้ากลุ่มงานการพยาบาล', 'หัวหน้าหอผู้ป่วย/หัวหน้างาน') then 1210
          when pos.pay_group in (1, 2) then 1210
          when pos.pay_group = 3 then 730
          when pos.pay_group in (4, 5) then 610
          else g.guarantee + 10 end
        else (g.guarantee * g.cap_mult) - (case
          when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
          when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
          else 0 end)
$old$;
  new_block text := $new$
        else (g.guarantee * g.cap_mult) - (case
          when coalesce(d.org_role, '') ilike '%หัวหน้ากลุ่มงาน%' or d.position = 'หัวหน้ากลุ่มงานการพยาบาล' then 240
          when coalesce(d.org_role, '') ilike '%หัวหน้างาน%' or d.position = 'หัวหน้าหอผู้ป่วย/หัวหน้างาน' then 120
          else 0 end)
$new$;
begin
  select pg_get_functiondef('public.p4p_calc(date)'::regprocedure) into fn;
  if position(old_block in fn) = 0 then
    raise exception 'Expected October cap block not found; migration stopped without changing p4p_calc';
  end if;
  fn := replace(fn, old_block, new_block);
  execute fn;
end $$;