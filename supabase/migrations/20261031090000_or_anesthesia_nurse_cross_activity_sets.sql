-- Allow nurses in OR and anesthesia nursing units to use nurse, patient-aide,
-- and ward-attendant activity sets. Other positions remain restricted to their own set.
create or replace view public.v_logs_base
with (security_invoker = true) as
with b as (
  select l.id, l.person_id, l.work_date, l.activity_code, l.role, l.qty, l.evidence, l.status, l.created_at,
         p.name as person_name, p.unit_id, p.position, pos.grp, pos.rate, pos.guarantee,
         a.domain, a.title, a.uom, a.minutes, a.max_day, a.max_month, a.need_evidence, a.no_dup_group,
         case
           when pos.grp = 'พยาบาล'
             and u.name in ('หน่วยงานการพยาบาลผู้ป่วยห้องผ่าตัด', 'งานการพยาบาลวิสัญญี')
           then array['พยาบาล', 'ผู้ช่วยเหลือคนไข้', 'พนักงานประจำตึก']::text[]
           else a.eligible
         end as eligible,
         a.use_role_mult,
         case when a.use_role_mult then (
           select s.value from app_settings s
           where s.key = case coalesce(l.role, '')
             when 'ประธาน' then 'mult_chair'
             when 'เลขานุการ/กรรมการ' then 'mult_sec'
             else 'mult_member'
           end
         ) else 1::numeric end as mult
  from logs l
  join people p on p.id = l.person_id
  join positions pos on pos.name = p.position
  join activities a on a.code = l.activity_code
  left join units u on u.id = p.unit_id
), c as (
  select b.*,
    b.qty * b.minutes * b.mult as l_min,
    b.qty * b.minutes as total_min,
    round(b.qty * b.minutes * b.mult * b.rate, 2) as points,
    sum(b.qty) over (partition by b.person_id, b.activity_code, b.work_date) as day_qty,
    sum(b.qty) over (partition by b.person_id, b.activity_code, date_trunc('month', b.work_date)) as mon_qty,
    sum(case when b.status <> 'rejected' then b.qty * b.minutes else 0::numeric end) over (partition by b.person_id, b.work_date) as day_min,
    count(*) over (partition by b.person_id, b.work_date, split_part(b.no_dup_group, ':', 1)) as grp_cnt,
    count(*) over (partition by b.person_id, b.work_date, b.no_dup_group) as var_cnt
  from b
), d as (
  select c.*,
    array_remove(array[
      case when not (c.grp = any(c.eligible)) then 'ตำแหน่งนี้บันทึกกิจกรรมนี้ไม่ได้' end,
      case when c.work_date > current_date then 'วันที่อยู่ในอนาคต' end
    ], null) as errors,
    array_remove(array[
      case when c.use_role_mult and coalesce(c.role, '') = '' then 'ไม่ระบุบทบาท (คิด ×สมาชิก)' end,
      case when c.need_evidence and coalesce(c.evidence, '') = '' then 'ไม่ระบุหลักฐาน' end,
      case when c.max_day > 0 and c.day_qty > c.max_day then 'เกินเพดาน/วัน (' || c.max_day || ')' end,
      case when c.max_month > 0 and c.mon_qty > c.max_month then 'เกินเพดาน/เดือน (' || c.max_month || ')' end,
      case when c.no_dup_group is not null and c.grp_cnt > c.var_cnt then 'ซ้ำซ้อนกับกิจกรรมทดแทนกันในวันเดียวกัน' end
    ], null) as warnings
  from c
)
select id, person_id, work_date, activity_code, role, qty, evidence, status, created_at,
       person_name, unit_id, position, grp, rate, guarantee, domain, title, uom, minutes,
       max_day, max_month, need_evidence, no_dup_group, eligible, use_role_mult, mult,
       l_min, total_min, points, day_qty, mon_qty, day_min, grp_cnt, var_cnt, errors,
       warnings as warnings_base,
       case when cardinality(errors) > 0 or status = 'rejected' then 0::numeric else points end as points_before_cap,
       date_trunc('month', work_date)::date as month
from d;