-- seed_full_school_5_feedback.sql — Colegio completo de demostración (parte 5: evaluación de clases).
-- TODOS los datos son ficticios. Respuestas de los estudiantes a «Evaluar mis clases» de agosto, septiembre y lo que
-- va de octubre de 2026, para todos los docentes. Cada docente tiene un nivel propio (entre 3,5 y 4,7 de 5) con
-- variación por dimensión y por estudiante; responde cerca del 60% del curso (30% en el mes en curso). Sin comentarios.

do $seed$
declare v_inst uuid := (select id from public.institutions where name = 'Colegio Futuro Andino');
begin
  alter table public.teacher_feedback disable trigger user;
  insert into public.teacher_feedback (institution_id, teacher_id, course_id, subject_id, student_id, period_month,
                                       claridad, ritmo, participacion, retroalimentacion, organizacion, trato, created_at)
    select v_inst, teacher_id, course_id, subject_id, student_id, month, d[1], d[2], d[3], d[4], d[5], d[6],
           least(month + make_interval(days => 8 + h % 15), now() - make_interval(hours => 5 + h % 200))
    from (
      select ta.teacher_id, ta.course_id, ta.subject_id, e.student_id, m.month,
             abs(hashtext(e.student_id::text || ta.teacher_id::text || ta.subject_id::text || m.month::text)) as h,
             (select array_agg(least(5, greatest(1, round(3.5 + (abs(hashtext(ta.teacher_id::text)) % 13) / 10.0
                       + ((abs(hashtext(ta.teacher_id::text || k::text)) % 7) - 3) / 10.0
                       + ((abs(hashtext(e.student_id::text || ta.teacher_id::text || m.month::text || k::text)) % 5) - 2) / 2.0)))::smallint order by k)
              from generate_series(1, 6) k) as d
      from public.teacher_assignments ta
      join public.subjects s on s.id = ta.subject_id and s.code not in ('ORI', 'REL')
      join public.courses c on c.id = ta.course_id and c.is_archived = false
      join public.course_enrollments e on e.course_id = ta.course_id and e.status = 'active'
      cross join (values (date '2026-08-01', 60), (date '2026-09-01', 65), (date '2026-10-01', 30)) m(month, rate)
      where ta.institution_id = v_inst
        and abs(hashtext(e.student_id::text || ta.teacher_id::text || ta.subject_id::text || m.month::text)) % 100 < m.rate
    ) x
    on conflict (student_id, teacher_id, course_id, subject_id, period_month) do nothing;
  alter table public.teacher_feedback enable trigger user;
end
$seed$;
