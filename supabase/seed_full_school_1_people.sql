-- seed_full_school_1_people.sql — Colegio completo de demostración (parte 1: asignaturas, cursos y personas).
-- TODOS los datos son ficticios. Se ejecuta después de seed.sql, una sola vez.
-- Deja 12 niveles (1.º básico a 4.º medio) con 4 secciones de 20 estudiantes, un apoderado por estudiante
-- y la planta docente. Las cuentas nuevas NO tienen contraseña: existen para poblar el colegio y no pueden iniciar sesión.

do $seed$
declare
  v_inst uuid := (select id from public.institutions where name = 'Colegio Futuro Andino');
  v_period uuid;
  v_lyl uuid; v_len uuid;
  fnf text[] := array['Martina','Sofía','Florencia','Isidora','Antonia','Emilia','Josefa','Agustina','Catalina','Valentina','Amanda','Trinidad','Maite','Julieta','Emma','Isabella','Renata','Antonella','Constanza','Fernanda','Javiera','Camila','Francisca','Ignacia','Colomba','Rafaela','Elisa','Laura','Paz','Amparo','Rocío','Daniela','Carolina','Bárbara','Macarena','Pía','Dominga','Leonor','Victoria','Gabriela'];
  fnm text[] := array['Benjamín','Agustín','Tomás','Vicente','Matías','Mateo','Lucas','Joaquín','Santiago','Maximiliano','Gaspar','Alonso','Martín','Bruno','Facundo','Cristóbal','Diego','Sebastián','Nicolás','Felipe','Ignacio','José Tomás','Renato','Emiliano','Simón','Julián','Borja','León','Clemente','Franco','Gabriel','Daniel','Pablo','Rodrigo','Andrés','Ian','Dante','Luciano','Álvaro','Camilo'];
  ln text[] := array['González','Muñoz','Rojas','Díaz','Pérez','Soto','Contreras','Silva','Martínez','Sepúlveda','Morales','Rodríguez','López','Fuentes','Hernández','Torres','Araya','Flores','Espinoza','Valenzuela','Castillo','Tapia','Reyes','Gutiérrez','Castro','Pizarro','Álvarez','Vásquez','Sánchez','Fernández','Ramírez','Carrasco','Gómez','Cortés','Herrera','Núñez','Jara','Vergara','Rivera','Figueroa','Riquelme','García','Miranda','Bravo','Vera','Molina','Vega','Campos','Sandoval','Orellana','Cárdenas','Olivares','Alarcón','Gallardo','Ortiz','Garrido','Salazar','Guzmán','Henríquez','Saavedra'];
begin
  if v_inst is null then raise exception 'Ejecuta primero seed.sql'; end if;
  if exists (select 1 from auth.users where email = 'alumno0001@futuroandino.example') then
    raise notice 'El colegio completo ya está cargado.'; return;
  end if;
  select id into v_period from public.academic_periods where institution_id = v_inst and is_current;

  -- ── Asignaturas del currículum vigente ──
  update public.subjects set name = 'Historia, Geografía y Ciencias Sociales' where institution_id = v_inst and code = 'HIS';
  insert into public.subjects (institution_id, name, code)
    select v_inst, x.n, x.c from (values
      ('Lengua y Literatura', 'LYL'), ('Inglés', 'ING'), ('Artes Visuales', 'ART'), ('Música', 'MUS'),
      ('Educación Física y Salud', 'EFI'), ('Tecnología', 'TEC'), ('Orientación', 'ORI'), ('Religión', 'REL'),
      ('Educación Ciudadana', 'EDC'), ('Filosofía', 'FIL'), ('Ciencias para la Ciudadanía', 'CPC')) x(n, c)
    where not exists (select 1 from public.subjects s where s.institution_id = v_inst and s.code = x.c);
  select id into v_lyl from public.subjects where institution_id = v_inst and code = 'LYL';
  select id into v_len from public.subjects where institution_id = v_inst and code = 'LEN';

  -- ── Cursos: 4 secciones por nivel ──
  insert into public.courses (institution_id, grade_level_id, period_id, section, name)
    select v_inst, gl.id, v_period, sec, gl.name || ' ' || sec
    from public.grade_levels gl cross join unnest(array['A','B','C','D']) sec
    where gl.institution_id = v_inst and gl.stage in ('basica', 'media')
    on conflict (institution_id, period_id, grade_level_id, section) do nothing;

  create temp table _c on commit drop as
    select c.id, c.section, x.gnum,
           (row_number() over (order by x.gnum, c.section) - 1)::int as rn,
           (row_number() over (partition by (x.gnum <= 4) order by x.gnum, c.section) - 1)::int as rn_band
    from public.courses c join public.grade_levels gl on gl.id = c.grade_level_id
    cross join lateral (select (case gl.stage when 'media' then 8 else 0 end + (regexp_match(gl.name, '\d+'))[1]::int) as gnum) x
    where c.institution_id = v_inst and c.is_archived = false and gl.stage in ('basica', 'media');

  -- Desde 7.º básico la asignatura se llama Lengua y Literatura: se traslada lo que los cursos de demostración tenían en Lenguaje.
  update public.course_subjects t set subject_id = v_lyl from _c where t.course_id = _c.id and _c.gnum >= 7 and t.subject_id = v_len;
  update public.teacher_assignments t set subject_id = v_lyl from _c where t.course_id = _c.id and _c.gnum >= 7 and t.subject_id = v_len;
  update public.assignments t set subject_id = v_lyl from _c where t.course_id = _c.id and _c.gnum >= 7 and t.subject_id = v_len;
  update public.grades t set subject_id = v_lyl from _c where t.course_id = _c.id and _c.gnum >= 7 and t.subject_id = v_len;
  update public.teacher_feedback t set subject_id = v_lyl from _c where t.course_id = _c.id and _c.gnum >= 7 and t.subject_id = v_len;
  update public.review_missions t set subject_id = v_lyl from _c where t.course_id = _c.id and _c.gnum >= 7 and t.subject_id = v_len;

  insert into public.course_subjects (institution_id, course_id, subject_id)
    select v_inst, _c.id, s.id from _c join public.subjects s on s.institution_id = v_inst and s.code = any (
      case when _c.gnum <= 6 then array['LEN','MAT','CNA','HIS','ING','ART','MUS','EFI','TEC','ORI','REL']
           when _c.gnum <= 10 then array['LYL','MAT','CNA','HIS','ING','ART','MUS','EFI','TEC','ORI','REL']
           else array['LYL','MAT','EDC','FIL','ING','CPC','HIS','EFI','ORI'] end)
    on conflict do nothing;

  -- ── Personas nuevas ──
  create temp table _u (id uuid default gen_random_uuid(), email text, full_name text, role text, birth date, phone text,
                        course uuid, k int, pool text, idx int, guardian_of int, rel text) on commit drop;

  -- Estudiantes: los que faltan para llegar a 20 por curso.
  insert into _u (email, full_name, role, birth, course, k)
    select 'alumno' || lpad(k::text, 4, '0') || '@futuroandino.example',
           (case when k % 2 = 0 then fnf[1 + (k * 7 + k / 13) % 40] else fnm[1 + (k * 7 + k / 13) % 40] end)
             || ' ' || ln[1 + (k * 11) % 60] || ' ' || ln[1 + (k * 17 + 5) % 60],
           'estudiante', make_date(2020 - gnum, 4, 1) + ((k * 37) % 364), id, k
    from (select _c.id, _c.gnum, row_number() over (order by _c.rn, g)::int as k
          from _c cross join lateral generate_series(1, 20 - (select count(*)::int from public.course_enrollments e where e.course_id = _c.id and e.status = 'active')) g) t;

  -- Un apoderado por estudiante nuevo: madre (apellido materno del estudiante) o padre (apellido paterno).
  insert into _u (email, full_name, role, phone, guardian_of, rel)
    select 'apoderado' || lpad(k::text, 4, '0') || '@futuroandino.example',
           case when k % 3 <> 0 then fnf[1 + (k * 13 + 3) % 40] || ' ' || ln[1 + (k * 17 + 5) % 60] || ' ' || ln[1 + (k * 23 + 9) % 60]
                else fnm[1 + (k * 13 + 3) % 40] || ' ' || ln[1 + (k * 11) % 60] || ' ' || ln[1 + (k * 23 + 9) % 60] end,
           'apoderado', '+56 9 5550 ' || lpad((1000 + k)::text, 4, '0'), k, case when k % 3 <> 0 then 'madre' else 'padre' end
    from _u where role = 'estudiante';

  -- Docentes por especialidad. GEN: profesor jefe de 1.º a 4.º básico, que hace las asignaturas principales de su curso.
  insert into _u (email, full_name, role, phone, pool, idx, k)
    select 'docente' || lpad(n::text, 2, '0') || '@futuroandino.example',
           (case when n % 3 = 0 then fnm[1 + (n * 9 + 4) % 40] else fnf[1 + (n * 9 + 4) % 40] end) || ' ' || ln[1 + (n * 19 + 7) % 60] || ' ' || ln[1 + (n * 29 + 11) % 60],
           'docente', '+56 9 5551 ' || lpad((2000 + n)::text, 4, '0'), pool, idx, size
    from (select p.pool, p.size, g - 1 as idx, row_number() over (order by p.ord, g)::int as n
          from (values ('GEN', 16, 1), ('LANG', 4, 2), ('MAT', 4, 3), ('CNA', 3, 4), ('HIS', 4, 5), ('ING', 6, 6), ('EFI', 6, 7),
                       ('MUS', 4, 8), ('REL', 4, 9), ('ART', 2, 10), ('TEC', 2, 11), ('EDC', 1, 12), ('FIL', 1, 13), ('CPC', 1, 14)) p(pool, size, ord)
          cross join lateral generate_series(1, p.size) g) t;

  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
    select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, now(),
           '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', full_name), now(), now(), '', '', '', ''
    from _u;
  update public.profiles p set birth_date = _u.birth, phone = _u.phone from _u where p.id = _u.id;
  insert into public.institution_memberships (institution_id, user_id, role, is_managed)
    select v_inst, id, role::public.member_role, role = 'estudiante' from _u;

  insert into public.course_enrollments (institution_id, course_id, student_id, enrolled_on)
    select v_inst, course, id, date '2026-03-03' from _u where role = 'estudiante';
  insert into public.guardian_student_links (institution_id, guardian_id, student_id, relationship, is_primary)
    select v_inst, g.id, s.id, g.rel, true from _u g join _u s on s.role = 'estudiante' and s.k = g.guardian_of where g.role = 'apoderado';

  -- ── Quién enseña qué ──
  insert into public.teacher_assignments (institution_id, course_id, subject_id, teacher_id)
    select v_inst, cs.course_id, cs.subject_id, t.id
    from public.course_subjects cs join _c on _c.id = cs.course_id join public.subjects s on s.id = cs.subject_id
    cross join lateral (select case
        when s.code in ('LEN','LYL','MAT','CNA','HIS','ART','TEC') and _c.gnum <= 4 then 'GEN'
        when s.code in ('LEN','LYL') then 'LANG' else s.code end as pool) m
    join _u t on t.role = 'docente' and t.pool = m.pool and t.idx = (case when m.pool = 'GEN' then _c.rn_band else _c.rn end) % t.k
    where s.code <> 'ORI'
      and not exists (select 1 from public.teacher_assignments ta where ta.course_id = cs.course_id and ta.subject_id = cs.subject_id);

  -- Profesor jefe: en 1.º a 4.º básico, su docente de curso; en el resto, quien hace Lenguaje o Matemática. También hace Orientación.
  update public.courses c set head_teacher_id = (
      select ta.teacher_id from public.teacher_assignments ta join public.subjects s on s.id = ta.subject_id
      where ta.course_id = c.id and s.code = any (case when _c.rn % 2 = 0 then array['LEN','LYL'] else array['MAT'] end) limit 1)
    from _c where c.id = _c.id and c.head_teacher_id is null;
  insert into public.teacher_assignments (institution_id, course_id, subject_id, teacher_id)
    select v_inst, cs.course_id, cs.subject_id, c.head_teacher_id
    from public.course_subjects cs join public.subjects s on s.id = cs.subject_id and s.code = 'ORI' join public.courses c on c.id = cs.course_id
    where c.institution_id = v_inst and c.head_teacher_id is not null
      and not exists (select 1 from public.teacher_assignments ta where ta.course_id = cs.course_id and ta.subject_id = cs.subject_id);
end
$seed$;
