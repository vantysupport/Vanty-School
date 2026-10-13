-- ── RLS a escala de colegio ───────────────────────────────────────────────────
-- Las políticas de lectura de notas, asistencia, entregas y matrículas preguntaban fila por fila «¿es mi pupilo?»,
-- «¿imparto este curso?». Con decenas de miles de filas, una consulta sin filtro agotaba el tiempo de espera.
-- Las reglas son exactamente las mismas; cambia la forma: cada pregunta se resuelve una vez por consulta, como un
-- conjunto (mis colegios, mis pupilos, lo que imparto), y las filas solo se comparan contra ese conjunto.

create or replace function app.my_insts(variadic p_roles text[] default '{}') returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.institution_id from public.institution_memberships m
  where m.user_id = (select auth.uid()) and app.my_role(m.institution_id) is not null
    and (cardinality(p_roles) = 0 or app.my_role(m.institution_id) = any (p_roles))
$$;

create or replace function app.my_pupils() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select l.student_id from public.guardian_student_links l
  where l.guardian_id = (select auth.uid()) and app.has_role(l.institution_id, 'apoderado')
$$;

create or replace function app.my_teaching() returns table (course_id uuid, subject_id uuid)
language sql stable security definer set search_path = '' as $$
  select ta.course_id, ta.subject_id from public.teacher_assignments ta
  where ta.teacher_id = (select auth.uid()) and app.has_role(ta.institution_id, 'docente')
$$;

create or replace function app.my_assignments() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.assignments a join app.my_teaching() t on t.course_id = a.course_id and t.subject_id = a.subject_id
$$;

-- Estudiantes con solicitud o caso de bienestar en los colegios donde soy parte del equipo de bienestar.
create or replace function app.my_wellbeing_files() returns table (institution_id uuid, student_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.institution_id, r.student_id from public.wellbeing_requests r where r.institution_id in (select app.my_insts('bienestar'))
  union
  select c.institution_id, c.student_id from public.wellbeing_cases c where c.institution_id in (select app.my_insts('bienestar'))
$$;

revoke execute on function app.my_insts(text[]), app.my_pupils(), app.my_teaching(), app.my_assignments(), app.my_wellbeing_files() from public, anon;
grant execute on function app.my_insts(text[]), app.my_pupils(), app.my_teaching(), app.my_assignments(), app.my_wellbeing_files() to authenticated, service_role;

drop policy grades_select on public.grades;
create policy grades_select on public.grades for select to authenticated using (
  institution_id in (select app.my_insts()) and (
    student_id = (select auth.uid())
    or student_id in (select app.my_pupils())
    or institution_id in (select app.my_insts('admin', 'directivo'))
    or (course_id, subject_id) in (select t.course_id, t.subject_id from app.my_teaching() t)
    or (institution_id, student_id) in (select w.institution_id, w.student_id from app.my_wellbeing_files() w)));

drop policy attendance_select on public.attendance_records;
create policy attendance_select on public.attendance_records for select to authenticated using (
  institution_id in (select app.my_insts()) and (
    student_id = (select auth.uid())
    or student_id in (select app.my_pupils())
    or institution_id in (select app.my_insts('admin', 'directivo'))
    or course_id in (select t.course_id from app.my_teaching() t)
    or (institution_id, student_id) in (select w.institution_id, w.student_id from app.my_wellbeing_files() w)));

drop policy submissions_select on public.assignment_submissions;
create policy submissions_select on public.assignment_submissions for select to authenticated using (
  institution_id in (select app.my_insts()) and (
    student_id = (select auth.uid())
    or student_id in (select app.my_pupils())
    or institution_id in (select app.my_insts('admin', 'directivo'))
    or assignment_id in (select app.my_assignments())));

drop policy enrollments_select on public.course_enrollments;
create policy enrollments_select on public.course_enrollments for select to authenticated using (
  institution_id in (select app.my_insts()) and (
    institution_id in (select app.my_insts('admin', 'directivo', 'bienestar'))
    or student_id = (select auth.uid())
    or course_id in (select t.course_id from app.my_teaching() t)
    or student_id in (select app.my_pupils())));

create index if not exists grades_student_idx on public.grades (student_id);
create index if not exists attendance_student_idx on public.attendance_records (student_id, date);
create index if not exists submissions_student_idx on public.assignment_submissions (student_id);
