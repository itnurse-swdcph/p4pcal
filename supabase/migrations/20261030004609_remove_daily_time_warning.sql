-- Daily limits are score-only; do not warn on activity duration.
create or replace view public.v_logs_base
with (security_invoker = true)
as
with b as (
  select l.id, l.person_id, l.work_date, l.activity_code, l.role, l.qty,
         l.evidence, l.status, l.created_at,
         p.name as person_name, p.unit_id, p.position,
         pos.grp, pos.rate, pos.guarantee,
         a.domain, a.title, a.uom, a.minutes, a.max_day, a.max_month,
         a.need_evidence, a.no_dup_group, a.eligible, a.use_role_mult,
         case when a.use_role_mult then (
           select s.value from public.app_settings s
           where s.key = case coalesce(l.role, '')
             when 'ประธาน' then 'mult_chair'
             when 'เลขานุการ/กรรมการ' then 'mult_sec'
             else 'mult_member'
           end
         ) else 1::numeric end as mult
  from public.logs l
  join public.people p on p.id = l.person_id
  join public.positions pos on pos.name = p.position
  join public.activities a on a.code = l.activity_code
), c as (
  select b.*,
         qty * minutes * mult as l_min,
         qty * minutes as total_min,
         round(qty * minutes * mult * rate, 2) as points,
         sum(qty) over (partition by person_id, activity_code, work_date) as day_qty,
         sum(qty) over (partition by person_id, activity_code, date_trunc('month', work_date)) as mon_qty,
         sum(case when status <> 'rejected' then qty * minutes else 0 end)
           over (partition by person_id, work_date) as day_min,
         count(*) over (partition by person_id, work_date, split_part(no_dup_group, ':', 1)) as grp_cnt,
         count(*) over (partition by person_id, work_date, no_dup_group) as var_cnt
  from b
), d as (
  select c.*,
         array_remove(array[
           case when not (grp = any(eligible)) then 'ตำแหน่งนี้บันทึกกิจกรรมนี้ไม่ได้' end,
           case when work_date > current_date then 'วันที่อยู่ในอนาคต' end
         ], null) as errors,
         array_remove(array[
           case when use_role_mult and coalesce(role, '') = '' then 'ไม่ระบุบทบาท (คิด ×สมาชิก)' end,
           case when need_evidence and coalesce(evidence, '') = '' then 'ไม่ระบุหลักฐาน' end,
           case when max_day > 0 and day_qty > max_day then 'เกินเพดาน/วัน (' || max_day || ')' end,
           case when max_month > 0 and mon_qty > max_month then 'เกินเพดาน/เดือน (' || max_month || ')' end,
           case when no_dup_group is not null and grp_cnt > var_cnt then 'ซ้ำซ้อนกับกิจกรรมทดแทนกันในวันเดียวกัน' end
         ], null) as warnings
  from c
)
select id, person_id, work_date, activity_code, role, qty, evidence, status, created_at,
       person_name, unit_id, position, grp, rate, guarantee,
       domain, title, uom, minutes, max_day, max_month,
       need_evidence, no_dup_group, eligible, use_role_mult, mult,
       l_min, total_min, points, day_qty, mon_qty, day_min, grp_cnt, var_cnt,
       errors, warnings as warnings_base,
       case when cardinality(errors) > 0 or status = 'rejected' then 0::numeric else points end as points_before_cap,
       date_trunc('month', work_date)::date as month
from d;

grant select on public.v_logs_base to authenticated;


alter table public.app_settings drop constraint if exists app_settings_cap_day_points_max_180;
alter table public.app_settings add constraint app_settings_cap_day_points_max_180 check (key <> 'cap_day_points' or value <= 180);
delete from public.app_settings where key = 'max_day_minutes';
