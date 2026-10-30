-- Match activity scoring rates to the current role worksheets.
update public.positions as p
set rate = r.rate
from (values
  ('พยาบาล', 0.143::numeric),
  ('ผู้ช่วยเหลือคนไข้', 0.071::numeric),
  ('พนักงานประจำตึก', 0.071::numeric),
  ('พนักงานธุรการ', 0.114::numeric),
  ('พนักงานเปล', 0.071::numeric),
  ('Paramedic', 0.143::numeric),
  ('EMT', 0.114::numeric)
) as r(activity_line, rate)
where p.grp = r.activity_line
  and p.rate is distinct from r.rate;
