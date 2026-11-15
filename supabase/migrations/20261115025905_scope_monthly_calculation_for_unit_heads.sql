do $$
declare v text; old text; new text;
begin
 v := pg_get_functiondef('public.p4p_calc(date)'::regprocedure);
 old := '  if stored is not null then' || E'\n' || '    return stored || jsonb_build_object(''closed'', true);' || E'\n' || '  end if;';
 new := '  if stored is not null then' || E'\n' ||
 '    if public.my_role() = ''head'' then' || E'\n' ||
 '      return stored || jsonb_build_object(''closed'', true, ''groups'', ''[]''::jsonb, ''lines'', (select coalesce(jsonb_agg(x.value), ''[]''::jsonb) from jsonb_array_elements(coalesce(stored->''lines'', ''[]''::jsonb)) x where coalesce((x.value->>''unit_id'')::integer, -1) in (select public.my_units())));' || E'\n' ||
 '    end if;' || E'\n' ||
 '    return stored || jsonb_build_object(''closed'', true);' || E'\n' || '  end if;';
 if position(old in v)=0 then raise exception 'closed anchor missing'; end if;
 v:=replace(v,old,new);
 old := 'if public.my_role() not in (''committee'',''admin'') then';
 new := 'if public.my_role() not in (''committee'',''admin'',''head'') then';
 if position(old in v)=0 then raise exception 'auth anchor missing'; end if;
 v:=replace(v,old,new);
 old := '  return jsonb_build_object(''month'', m, ''closed'', false, ''groups'', groups, ''lines'', lines,';
 new := '  if public.my_role() = ''head'' then' || E'\n' ||
 '    return jsonb_build_object(''month'', m, ''closed'', false, ''groups'', ''[]''::jsonb, ''lines'', (select coalesce(jsonb_agg(x.value), ''[]''::jsonb) from jsonb_array_elements(lines) x where coalesce((x.value->>''unit_id'')::integer, -1) in (select public.my_units())), ''warnings'', jsonb_build_object(''quality_missing_units'', ''[]''::jsonb, ''pending_rows'', pend));' || E'\n' ||
 '  end if;' || E'\n' ||
 '  return jsonb_build_object(''month'', m, ''closed'', false, ''groups'', groups, ''lines'', lines,';
 if position(old in v)=0 then raise exception 'return anchor missing'; end if;
 v:=replace(v,old,new);
 execute v;
end $$;