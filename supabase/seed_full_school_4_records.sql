-- seed_full_school_4_records.sql — Colegio completo de demostración (parte 4: fichas y continuidad).
-- TODOS los datos son ficticios (RUN del rango 99.xxx.xxx-K, que no corresponde a personas; direcciones inventadas).
-- Deja completas las fichas de las personas creadas en la parte 1, salvo unos pocos estudiantes sin contacto de
-- emergencia, y marca la continuidad del próximo año para la mayoría de la matrícula.

do $f$
declare v_inst uuid := (select id from public.institutions where name = 'Colegio Futuro Andino');
  comunas text[] := array['Ñuñoa','Providencia','Santiago','La Florida','Maipú','Macul','San Miguel','La Reina','Peñalolén','Puente Alto'];
begin
  create temp table _n on commit drop as
    select p.id, m.role::text as role, (row_number() over (order by p.email))::int as n, abs(hashtext(p.id::text)) as h
    from public.profiles p join public.institution_memberships m on m.user_id = p.id and m.institution_id = v_inst
    where p.email ~ '^(alumno|apoderado|docente)[0-9]+@futuroandino\.example$';
  update public.profiles p set
      phone = coalesce(p.phone, '+56 9 5552 ' || lpad((_n.n % 10000)::text, 4, '0')),
      birth_date = coalesce(p.birth_date, case _n.role when 'docente' then date '1968-01-15' + (_n.h % 10200) else date '1974-01-15' + (_n.h % 6900) end)
    from _n where p.id = _n.id;
  insert into public.person_records (institution_id, user_id, national_id, gender, nationality, address, commune,
                                     emergency_name, emergency_phone, emergency_relation, admission_date, job_title, specialty)
    select v_inst, _n.id, '99.' || lpad((200 + _n.n / 1000)::text, 3, '0') || '.' || lpad((_n.n % 1000)::text, 3, '0') || '-K',
           'no_informa', 'Chilena', 'Calle Ficticia ' || (100 + _n.h % 4800) || ' (dato de demostración)', comunas[1 + _n.h % 10],
           case when _n.role = 'estudiante' and _n.h % 48 <> 0 then g.full_name end,
           case when _n.role = 'estudiante' and _n.h % 48 <> 0 then g.phone end,
           case when _n.role = 'estudiante' and _n.h % 48 <> 0 then initcap(g.relationship) end,
           case when _n.role = 'apoderado' then null else date '2026-03-02' end,
           case when _n.role = 'docente' then 'Docente de aula' end,
           case when _n.role = 'docente' then (
             select case when count(distinct s.name) > 3 then 'Educación general básica' else string_agg(distinct s.name, ', ') end
             from public.teacher_assignments ta join public.subjects s on s.id = ta.subject_id where ta.teacher_id = _n.id and s.code <> 'ORI') end
    from _n left join lateral (select gp.full_name, gp.phone, l.relationship from public.guardian_student_links l
                               join public.profiles gp on gp.id = l.guardian_id where l.student_id = _n.id limit 1) g on true
    on conflict do nothing;
  update public.course_enrollments e set continuity = 'promote'
    from _n where e.student_id = _n.id and e.status = 'active' and _n.h % 7 <> 0;
end $f$;
