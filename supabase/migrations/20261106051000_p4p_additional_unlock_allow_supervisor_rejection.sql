do $patch$
declare f text; old_def text; new_def text;
begin
 select pg_get_functiondef('public.guard_p4p_submission_lock()'::regprocedure) into f;
 old_def := 'new.status in (''approved'',''draft'')';
 new_def := 'new.status in (''approved'',''draft'',''rejected'')';
 if position(old_def in f)=0 then
   if position(new_def in f)>0 then return; end if;
   raise exception 'Expected guard clause was not found';
 end if;
 execute replace(f,old_def,new_def);
end
$patch$;