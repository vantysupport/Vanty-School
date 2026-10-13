-- 0007_active_membership.sql — Una cuenta desactivada no lee nada, ni siquiera sus propios registros.
-- Las cláusulas "es mi propio registro" (student_id = auth.uid(), etc.) no exigían pertenencia activa,
-- así que un estudiante suspendido conservaba la lectura de sus notas, asistencia y matrículas.
-- Ahora toda política de lectura sobre datos del colegio parte por app.is_member(institution_id).

drop policy enrollments_select on public.course_enrollments;
create policy enrollments_select on public.course_enrollments for select to authenticated
  using (app.is_member(institution_id) and (
    app.has_role(institution_id, 'admin', 'directivo', 'bienestar') or student_id = (select auth.uid())
    or app.teaches_course(course_id) or app.is_guardian_of(student_id)));

drop policy guardian_links_select on public.guardian_student_links;
create policy guardian_links_select on public.guardian_student_links for select to authenticated
  using (app.is_member(institution_id) and (
    app.has_role(institution_id, 'admin', 'bienestar') or guardian_id = (select auth.uid())
    or student_id = (select auth.uid()) or app.teaches_student(student_id)));

drop policy submissions_select on public.assignment_submissions;
create policy submissions_select on public.assignment_submissions for select to authenticated
  using (app.is_member(institution_id) and (
    student_id = (select auth.uid()) or app.is_guardian_of(student_id)
    or app.has_role(institution_id, 'admin', 'directivo') or app.teaches_assignment(assignment_id)));

drop policy grades_select on public.grades;
create policy grades_select on public.grades for select to authenticated
  using (app.is_member(institution_id) and (
    student_id = (select auth.uid()) or app.is_guardian_of(student_id)
    or app.has_role(institution_id, 'admin', 'directivo') or app.teaches(course_id, subject_id)
    or (app.has_role(institution_id, 'bienestar') and app.has_wellbeing_file(institution_id, student_id))));

drop policy attendance_select on public.attendance_records;
create policy attendance_select on public.attendance_records for select to authenticated
  using (app.is_member(institution_id) and (
    student_id = (select auth.uid()) or app.is_guardian_of(student_id)
    or app.has_role(institution_id, 'admin', 'directivo') or app.teaches_course(course_id)
    or (app.has_role(institution_id, 'bienestar') and app.has_wellbeing_file(institution_id, student_id))));

drop policy ai_interactions_select on public.ai_interactions;
create policy ai_interactions_select on public.ai_interactions for select to authenticated
  using (user_id = (select auth.uid()) and app.is_member(institution_id));

drop policy ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (app.is_member(institution_id) and (user_id = (select auth.uid()) or app.has_role(institution_id, 'admin')));

-- Los archivos de un administrador saliente o de otro docente también deben poder retirarse.
drop policy materials_delete on storage.objects;
create policy materials_delete on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and (
    app.has_role(app.safe_uuid((storage.foldername(name))[1]), 'admin')
    or (owner_id = (select auth.uid())::text and app.has_role(app.safe_uuid((storage.foldername(name))[1]), 'directivo', 'docente'))));
