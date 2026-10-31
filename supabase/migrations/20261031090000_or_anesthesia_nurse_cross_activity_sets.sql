-- Allow nurses in OR and anesthesia nursing units to use nurse, patient-aide,
-- and ward-attendant activity sets. Other positions remain restricted to their own set.
create or replace view public.v_logs
with (security_invoker = true) as
with b as (
  select l.id, l.person_id, l.work_date, l.activity_code, l.role, l.qty, l.evidence, l.status, l.created_at,
         p.name person_name, p.unit_id, p.position, pos.grp, pos.rate, pos.guarantee,
         a.domain, a.title, a.uom, a.minutes, a.max_day, a.max_month, a.need_evidence, a.no_dup_group,
         case
           when pos.grp = 'พยาบาล'
             and u.name in ('หน่วยงานการพยาบาลผู้ป่วยห้องผ่าตัด', 'งานการพยาบาลวิสัญญี')
           then array['พยาบาล', 'ผู้ช่วยเหลือคนไข้', 'พนักงานประจำตึก']::text[]
           else a.eligible
         end as eligible,
         a.use_role_mult,
         case when a.use_role_mult then
           (select value from app_settings where key = case coalesce(l.role,'') when 'ประธาน' then 'mult_chair'
              when 'เลขานุการ/กรรมการ' then 'mult_sec' else 'mult_member' end)
         else 1 end mult
  from logs l
  join people p on p.id = l.person_id
  join positions pos on pos.name = p.position
  join activities a on a.code = l.activity_code
  left join units u on u.id = p.unit_id
), c as (
  select *, qty * minutes as total_min, round(l_min * rate, 2) points,
    sum(qty) over (partition by person_id, activity_code, work_date) day_qty,
    sum(qty) over (partition by person_id, activity_code, date_trunc('month', work_date)) mon_qty,
    sum(case when status <> 'rejected' then qty * minutes else 0 end) over (partition by person_id, work_date) day_min,
    count(*) over (partition by person_id, work_date, split_part(no_dup_group, ':', 1)) grp_cnt,
    count(*) over (partition by person_id, work_date, no_dup_group) var_cnt
  from (select b.*, qty * minutes * mult l_min from b) b
), d as (
  select c.*,
    array_remove(array[
      case when not (grp = any(eligible)) then 'ตำแหน่งนี้บันทึกกิจกรรมนี้ไม่ได้' end,
      case when work_date > current_date then 'วันที่อยู่ในอนาคต' end ], null) errors,
    array_remove(array[
      case when use_role_mult and coalesce(role,'') = '' then 'ไม่ระบุบทบาท (คิด ×สมาชิก)' end,
      case when need_evidence and coalesce(evidence,'') = '' then 'ไม่ระบุหลักฐาน' end,
      case when max_day > 0 and day_qty > max_day then 'เกินเพดาน/วัน (' || max_day || ')' end,
      case when max_month > 0 and mon_qty > max_month then 'เกินเพดาน/เดือน (' || max_month || ')' end,
      case when no_dup_group is not null and grp_cnt > var_cnt then 'ซ้ำซ้อนกับกิจกรรมทดแทนกันในวันเดียวกัน' end
      ], null) warnings
  from c
)
select d.*, case when cardinality(errors) > 0 or status = 'rejected' then 0 else points end counted_points,
       date_trunc('month', work_date)::date as month
from d;
grant select on public.v_logs to authenticated;
