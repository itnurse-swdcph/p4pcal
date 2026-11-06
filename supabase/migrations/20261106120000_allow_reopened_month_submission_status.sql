alter table public.p4p_month_submissions
  drop constraint if exists p4p_month_submissions_status_check;

alter table public.p4p_month_submissions
  add constraint p4p_month_submissions_status_check
  check (
    status = any (
      array[
        'submitted'::text,
        'returned'::text,
        'resubmitted'::text,
        'reviewed'::text,
        'reopened'::text
      ]
    )
  );
