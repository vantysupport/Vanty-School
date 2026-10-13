-- seed_full_school_3_attendance.sql — Colegio completo de demostración (parte 3: asistencia del año escolar 2026).
-- TODOS los datos son ficticios. Días hábiles del 3 de marzo al último día de clases antes de hoy, sin vacaciones de
-- invierno (22 al 30 de julio), semana de Fiestas Patrias ni feriados. La mayoría asiste sobre 93%; cerca de 1 de cada
-- 16 estudiantes tiene asistencia baja (bajo 85%), que es lo que dirección y bienestar necesitan poder detectar.

do $seed$
declare
  v_inst uuid := (select id from public.institutions where name = 'Colegio Futuro Andino');
begin
  alter table public.attendance_records disable trigger user;
  insert into public.attendance_records (institution_id, course_id, student_id, date, status, recorded_by)
    select v_inst, e.course_id, e.student_id, d::date,
           case when h < p then 'present' when h < p + (100 - p) * 0.55 then 'absent' when h < p + (100 - p) * 0.8 then 'late' else 'justified' end,
           c.head_teacher_id
    from public.course_enrollments e
    join public.courses c on c.id = e.course_id and c.institution_id = v_inst and c.is_archived = false and c.head_teacher_id is not null
    cross join generate_series(date '2026-03-03', current_date - 1, interval '1 day') d
    cross join lateral (select abs(hashtext(e.student_id::text || d::date::text)) % 100 as h,
                               case when abs(hashtext('a' || e.student_id::text)) % 16 = 0 then 78 + abs(hashtext(e.student_id::text)) % 8
                                    else 92 + abs(hashtext(e.student_id::text)) % 7 end as p) x
    where e.status = 'active' and extract(isodow from d) <= 5
      and d::date not between date '2026-07-22' and date '2026-07-30'
      and d::date not between date '2026-09-14' and date '2026-09-18'
      and d::date not in (date '2026-04-03', date '2026-05-01', date '2026-05-21', date '2026-06-29', date '2026-07-16')
    on conflict (course_id, student_id, date) do nothing;
  alter table public.attendance_records enable trigger user;
end
$seed$;
