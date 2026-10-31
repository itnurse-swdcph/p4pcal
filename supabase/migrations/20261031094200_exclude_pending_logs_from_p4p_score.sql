create or replace view public.v_logs_base as
 WITH b AS (
         SELECT l.id,
            l.person_id,
            l.work_date,
            l.activity_code,
            l.role,
            l.qty,
            l.evidence,
            l.status,
            l.created_at,
            p.name AS person_name,
            p.unit_id,
            p."position",
            pos.grp,
            pos.rate,
            pos.guarantee,
            a.domain,
            a.title,
            a.uom,
            a.minutes,
            a.max_day,
            a.max_month,
            a.need_evidence,
            a.no_dup_group,
                CASE
                    WHEN pos.grp = 'พยาบาล'::text AND (u.name = ANY (ARRAY['งานการพยาบาลผู้ป่วยห้องผ่าตัด'::text, 'งานการพยาบาลวิสัญญี'::text])) THEN ARRAY['พยาบาล'::text, 'ผู้ช่วยเหลือคนไข้'::text, 'พนักงานประจำตึก'::text]
                    ELSE a.eligible
                END AS eligible,
            false AS use_role_mult,
            1::numeric AS mult
           FROM logs l
             JOIN people p ON p.id = l.person_id
             JOIN positions pos ON pos.name = p."position"
             JOIN activities a ON a.code = l.activity_code
             LEFT JOIN units u ON u.id = p.unit_id
        ), c AS (
         SELECT b.id,
            b.person_id,
            b.work_date,
            b.activity_code,
            b.role,
            b.qty,
            b.evidence,
            b.status,
            b.created_at,
            b.person_name,
            b.unit_id,
            b."position",
            b.grp,
            b.rate,
            b.guarantee,
            b.domain,
            b.title,
            b.uom,
            b.minutes,
            b.max_day,
            b.max_month,
            b.need_evidence,
            b.no_dup_group,
            b.eligible,
            b.use_role_mult,
            b.mult,
            b.qty * b.minutes AS l_min,
            b.qty * b.minutes AS total_min,
            round(b.qty * b.minutes * b.rate, 2) AS points,
            sum(b.qty) OVER (PARTITION BY b.person_id, b.activity_code, b.work_date) AS day_qty,
            sum(b.qty) OVER (PARTITION BY b.person_id, b.activity_code, (date_trunc('month'::text, b.work_date::timestamp with time zone))) AS mon_qty,
            sum(
                CASE
                    WHEN b.status <> 'rejected'::text THEN b.qty * b.minutes
                    ELSE 0::numeric
                END) OVER (PARTITION BY b.person_id, b.work_date) AS day_min,
            count(*) OVER (PARTITION BY b.person_id, b.work_date, (split_part(b.no_dup_group, ':'::text, 1))) AS grp_cnt,
            count(*) OVER (PARTITION BY b.person_id, b.work_date, b.no_dup_group) AS var_cnt
           FROM b
        ), d AS (
         SELECT c.id,
            c.person_id,
            c.work_date,
            c.activity_code,
            c.role,
            c.qty,
            c.evidence,
            c.status,
            c.created_at,
            c.person_name,
            c.unit_id,
            c."position",
            c.grp,
            c.rate,
            c.guarantee,
            c.domain,
            c.title,
            c.uom,
            c.minutes,
            c.max_day,
            c.max_month,
            c.need_evidence,
            c.no_dup_group,
            c.eligible,
            c.use_role_mult,
            c.mult,
            c.l_min,
            c.total_min,
            c.points,
            c.day_qty,
            c.mon_qty,
            c.day_min,
            c.grp_cnt,
            c.var_cnt,
            array_remove(ARRAY[
                CASE
                    WHEN NOT (c.grp = ANY (c.eligible)) THEN 'ตำแหน่งนี้บันทึกกิจกรรมนี้ไม่ได้'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN c.work_date > CURRENT_DATE THEN 'วันที่อยู่ในอนาคต'::text
                    ELSE NULL::text
                END], NULL::text) AS errors,
            array_remove(ARRAY[
                CASE
                    WHEN c.need_evidence AND COALESCE(c.evidence, ''::text) = ''::text THEN 'ไม่ระบุหลักฐาน'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN c.max_day > 0::numeric AND c.day_qty > c.max_day THEN ('เกินเพดาน/วัน ('::text || c.max_day) || ')'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN c.max_month > 0::numeric AND c.mon_qty > c.max_month THEN ('เกินเพดาน/เดือน ('::text || c.max_month) || ')'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN c.no_dup_group IS NOT NULL AND c.grp_cnt > c.var_cnt THEN 'ซ้ำซ้อนกับกิจกรรมทดแทนกันในวันเดียวกัน'::text
                    ELSE NULL::text
                END], NULL::text) AS warnings
           FROM c
        )
 SELECT id,
    person_id,
    work_date,
    activity_code,
    role,
    qty,
    evidence,
    status,
    created_at,
    person_name,
    unit_id,
    "position",
    grp,
    rate,
    guarantee,
    domain,
    title,
    uom,
    minutes,
    max_day,
    max_month,
    need_evidence,
    no_dup_group,
    eligible,
    use_role_mult,
    mult,
    l_min,
    total_min,
    points,
    day_qty,
    mon_qty,
    day_min,
    grp_cnt,
    var_cnt,
    errors,
    warnings AS warnings_base,
        CASE
            WHEN cardinality(errors) > 0 OR (status = ANY (ARRAY['rejected'::text, 'pending'::text, 'draft'::text])) THEN 0::numeric
            ELSE points
        END AS points_before_cap,
    date_trunc('month'::text, work_date::timestamp with time zone)::date AS month
   FROM d;;
