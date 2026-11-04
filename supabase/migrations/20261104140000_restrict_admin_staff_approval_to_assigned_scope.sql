-- Keep system-admin approval separate from staff-linked admin accounts.
-- Staff-linked admin accounts may approve only the person assigned by
-- assigned_approver_for_person(), while the standalone admin account retains
-- global approval access. No activity rows or approval states are modified.

CREATE OR REPLACE FUNCTION public.can_approve_person(pid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.user_id = auth.uid()
        AND me.role = 'admin'
        AND me.staff_directory_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.people p
          WHERE p.id = pid AND p.user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles me
      LEFT JOIN public.staff_directory sd ON sd.source_row = me.staff_directory_id
      JOIN public.people subject ON subject.id = pid AND subject.user_id = auth.uid()
      WHERE me.user_id = auth.uid()
        AND (
          replace(trim(coalesce(me.position,'')), ' ', '') IN ('หัวหน้าพยาบาล','รักษาการหัวหน้าพยาบาล','หัวหน้าพยาบาล(รักษาการ)')
          OR replace(trim(coalesce(sd.position,'')), ' ', '') IN ('หัวหน้าพยาบาล','รักษาการหัวหน้าพยาบาล','หัวหน้าพยาบาล(รักษาการ)')
          OR me.staff_directory_id = 2
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.assigned_approver_for_person(pid) a
      JOIN public.profiles me ON me.user_id = auth.uid()
      WHERE a.approver_user_id = auth.uid()
        AND me.staff_directory_id = a.approver_staff_directory_id
        AND (
          (a.approver_staff_directory_id = 2 AND a.approver_stage = 'รักษาการหัวหน้าพยาบาล')
          OR NOT EXISTS (
            SELECT 1 FROM public.people p
            WHERE p.id = pid AND p.user_id = auth.uid()
          )
        )
    );
$function$;
