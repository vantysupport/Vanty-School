-- ── Indicadores académicos a escala de colegio ───────────────────────────────
-- Con un colegio completo (cerca de mil estudiantes) las notas, entregas y asistencia ya no caben en las consultas
-- por tabla: la API corta en 1.000 filas y los indicadores quedarían calculados sobre una parte. Esta función entrega
-- todo en una sola respuesta compacta (los ids largos se reemplazan por posiciones).
--
-- Corre con privilegios propios para no evaluar RLS fila por fila en decenas de miles de registros, así que repite
-- aquí las mismas reglas de lectura: administración y dirección ven el colegio; un docente, sus cursos (tareas,
-- matrícula y asistencia) y las notas y entregas de las asignaturas que imparte. Cualquier otro rol no recibe nada.
-- La asistencia viene acotada a las últimas cinco semanas, que es la ventana que muestran los paneles.

create or replace function public.academic_snapshot(p_inst uuid, p_course uuid default null, p_subject uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_staff boolean := app.has_role(p_inst, 'admin', 'directivo');
  v_out jsonb;
begin
  if v_uid is null or not (v_staff or app.has_role(p_inst, 'docente')) then
    return jsonb_build_object('students', '[]'::jsonb, 'assignments', '[]'::jsonb, 'grades', '[]'::jsonb, 'loose', '[]'::jsonb,
                              'submissions', '[]'::jsonb, 'enrollments', '[]'::jsonb, 'attendance', '[]'::jsonb);
  end if;

  with
  my as (select ta.course_id, ta.subject_id from public.teacher_assignments ta where ta.institution_id = p_inst and ta.teacher_id = v_uid),
  crs as (select c.id from public.courses c
          where c.institution_id = p_inst and c.is_archived = false and (p_course is null or c.id = p_course)
            and (v_staff or c.id in (select m.course_id from my m))),
  a as (select x.id, x.course_id, x.subject_id, x.title, x.topic, x.due_at, x.status, x.kind, x.weight,
               (row_number() over (order by x.due_at, x.id) - 1)::int as ai
        from public.assignments x
        where x.institution_id = p_inst and x.status <> 'draft' and x.course_id in (select id from crs)
          and (p_subject is null or x.subject_id = p_subject)),
  g as (select gr.assignment_id, gr.course_id, gr.subject_id, gr.student_id, gr.score
        from public.grades gr
        where gr.institution_id = p_inst and gr.course_id in (select id from crs) and (p_subject is null or gr.subject_id = p_subject)
          and (v_staff or (gr.course_id, gr.subject_id) in (select m.course_id, m.subject_id from my m))),
  sb as (select s.assignment_id, s.student_id
         from public.assignment_submissions s join a on a.id = s.assignment_id
         where v_staff or (a.course_id, a.subject_id) in (select m.course_id, m.subject_id from my m)),
  en as (select e.course_id, e.student_id from public.course_enrollments e
         where e.institution_id = p_inst and e.status = 'active' and e.course_id in (select id from crs)),
  att as (select r.course_id, r.student_id, r.status, r.date from public.attendance_records r
          where r.institution_id = p_inst and r.course_id in (select id from crs) and r.date >= current_date - 35),
  st as (select u.sid, (row_number() over (order by u.sid) - 1)::int as si
         from (select student_id as sid from g union select student_id from sb union select student_id from en union select student_id from att) u)
  select jsonb_build_object(
    'students', coalesce((select jsonb_agg(st.sid order by st.si) from st), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(jsonb_build_array(a.id, a.course_id, a.subject_id, a.title, a.topic, a.due_at, a.status, a.kind, a.weight) order by a.ai) from a), '[]'::jsonb),
    -- [posición de la tarea, posición del estudiante, nota]
    'grades', coalesce((select jsonb_agg(jsonb_build_array(a.ai, st.si, g.score)) from g join a on a.id = g.assignment_id join st on st.sid = g.student_id), '[]'::jsonb),
    -- Notas sin tarea asociada (o de una tarea fuera de esta consulta): van con sus ids completos.
    'loose', coalesce((select jsonb_agg(jsonb_build_array(g.assignment_id, g.course_id, g.subject_id, st.si, g.score))
                       from g join st on st.sid = g.student_id where not exists (select 1 from a where a.id = g.assignment_id)), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(jsonb_build_array(a.ai, st.si)) from sb join a on a.id = sb.assignment_id join st on st.sid = sb.student_id), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(jsonb_build_array(en.course_id, st.si)) from en join st on st.sid = en.student_id), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_array(att.course_id, st.si, att.status, att.date)) from att join st on st.sid = att.student_id), '[]'::jsonb))
  into v_out;
  return v_out;
end $$;
revoke execute on function public.academic_snapshot(uuid, uuid, uuid) from public, anon;
grant execute on function public.academic_snapshot(uuid, uuid, uuid) to authenticated;

-- Promedio de notas por semana (0 = esta semana). Respeta RLS: cada quien promedia lo que puede ver.
create or replace function public.weekly_grade_averages(p_inst uuid, p_weeks integer default 6)
returns table (age integer, average numeric, n integer) language sql stable security invoker set search_path = '' as $$
  select floor(extract(epoch from (now() - g.graded_at)) / 604800)::int, avg(g.score), count(*)::int
  from public.grades g
  where g.institution_id = p_inst and g.graded_at >= now() - make_interval(weeks => p_weeks)
  group by 1
$$;
revoke execute on function public.weekly_grade_averages(uuid, integer) from public, anon;
grant execute on function public.weekly_grade_averages(uuid, integer) to authenticated;

create index if not exists attendance_records_inst_date_idx on public.attendance_records (institution_id, date);
create index if not exists grades_inst_graded_idx on public.grades (institution_id, graded_at);
