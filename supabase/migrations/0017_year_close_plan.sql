-- 0017_year_close_plan.sql — Cierre de año: una sección nueva de un grado que no existía este año
-- parte con el plan de asignaturas del curso del que vienen sus estudiantes (antes quedaba sin plan).

create or replace function public.close_school_year(p_inst uuid, p_target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cur public.academic_periods%rowtype;
  v_tgt public.academic_periods%rowtype;
  v_last uuid;
  v_level record;
  v_course uuid;
  v_template uuid;
  r record;
  n_promoted int := 0; n_retained int := 0; n_left int := 0; n_graduated int := 0; n_courses int := 0;
begin
  if not app.has_role(p_inst, 'admin') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into v_cur from public.academic_periods where institution_id = p_inst and is_current;
  if not found then raise exception 'No hay un periodo vigente.'; end if;
  select * into v_tgt from public.academic_periods where id = p_target and institution_id = p_inst;
  if not found or v_tgt.year <= v_cur.year then raise exception 'El periodo de destino debe ser de un año posterior al vigente.'; end if;
  if exists (select 1 from public.course_enrollments e join public.courses c on c.id = e.course_id
             where e.institution_id = p_inst and e.status = 'active' and c.period_id = v_cur.id and e.continuity = 'pending') then
    raise exception 'Aún hay estudiantes sin decisión de continuidad.';
  end if;
  select id into v_last from public.grade_levels where institution_id = p_inst order by sort_order desc limit 1;

  for r in
    select e.id, e.student_id, e.continuity, c.id as course_id, c.section, c.name as course_name, c.capacity, gl.id as level_id, gl.sort_order, gl.name as level_name
    from public.course_enrollments e
    join public.courses c on c.id = e.course_id
    join public.grade_levels gl on gl.id = c.grade_level_id
    where e.institution_id = p_inst and e.status = 'active' and c.period_id = v_cur.id
    order by gl.sort_order, c.section
  loop
    if r.continuity = 'leave' then
      update public.course_enrollments set status = 'withdrawn', closed_at = now() where id = r.id;
      n_left := n_left + 1;
    elsif r.continuity = 'promote' and r.level_id = v_last then
      update public.course_enrollments set status = 'graduated', closed_at = now() where id = r.id;
      insert into public.alumni (institution_id, student_id, graduation_year, last_course) values (p_inst, r.student_id, v_cur.year, r.course_name)
        on conflict (institution_id, student_id) do update set graduation_year = excluded.graduation_year, last_course = excluded.last_course, graduated_at = now();
      n_graduated := n_graduated + 1;
    else
      if r.continuity = 'repeat' then
        select id, name into v_level from public.grade_levels where id = r.level_id;
      else
        select id, name into v_level from public.grade_levels where institution_id = p_inst and sort_order > r.sort_order order by sort_order limit 1;
      end if;
      select id into v_course from public.courses
        where institution_id = p_inst and period_id = v_tgt.id and grade_level_id = v_level.id and section = r.section;
      if not found then
        insert into public.courses (institution_id, grade_level_id, period_id, section, name, capacity)
          values (p_inst, v_level.id, v_tgt.id, r.section, v_level.name || ' ' || r.section, r.capacity) returning id into v_course;
        -- Plan de asignaturas: el que tuvo este año la misma sección de ese grado; si no existía, el de otra sección del grado.
        select id into v_template from public.courses
          where institution_id = p_inst and period_id = v_cur.id and grade_level_id = v_level.id order by (section = r.section) desc, section limit 1;
        -- Si ese grado no tuvo secciones este año, se parte del plan del curso del que viene el estudiante.
        insert into public.course_subjects (institution_id, course_id, subject_id)
          select p_inst, v_course, cs.subject_id from public.course_subjects cs where cs.course_id = coalesce(v_template, r.course_id) on conflict do nothing;
        n_courses := n_courses + 1;
      end if;
      update public.course_enrollments set status = case when r.continuity = 'repeat' then 'retained' else 'promoted' end, closed_at = now() where id = r.id;
      insert into public.course_enrollments (institution_id, course_id, student_id, status, continuity) values (p_inst, v_course, r.student_id, 'active', 'pending')
        on conflict (course_id, student_id) do update set status = 'active', continuity = 'pending', closed_at = null;
      if r.continuity = 'repeat' then n_retained := n_retained + 1; else n_promoted := n_promoted + 1; end if;
    end if;
  end loop;

  -- El año cerrado pasa a historial: sus cursos se archivan y sus asignaciones docentes se guardan aparte.
  insert into public.teacher_assignments_archive (id, institution_id, course_id, subject_id, teacher_id, created_at)
    select ta.id, ta.institution_id, ta.course_id, ta.subject_id, ta.teacher_id, ta.created_at
    from public.teacher_assignments ta join public.courses c on c.id = ta.course_id where c.institution_id = p_inst and c.period_id = v_cur.id
    on conflict (id) do nothing;
  delete from public.teacher_assignments ta using public.courses c where c.id = ta.course_id and c.institution_id = p_inst and c.period_id = v_cur.id;
  update public.courses set is_archived = true where institution_id = p_inst and period_id = v_cur.id;
  update public.academic_periods set is_current = false where institution_id = p_inst and is_current;
  update public.academic_periods set is_current = true where id = v_tgt.id;

  insert into public.audit_logs (institution_id, actor_id, action, entity, entity_id, sensitive, metadata)
    values (p_inst, (select auth.uid()), 'year.close', 'period', v_cur.id::text, false,
      jsonb_build_object('from', v_cur.year, 'to', v_tgt.year, 'promoted', n_promoted, 'retained', n_retained, 'left', n_left, 'graduated', n_graduated));
  return jsonb_build_object('year', v_cur.year, 'next_year', v_tgt.year, 'promoted', n_promoted, 'retained', n_retained, 'left', n_left, 'graduated', n_graduated, 'courses_created', n_courses);
end $$;
