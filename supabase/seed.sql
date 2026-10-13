-- seed.sql — Entorno de demostración para Jump Chile 2026.
-- TODOS los datos son ficticios. No corresponden a personas ni colegios reales.
--
-- Antes de ejecutar: reemplaza __DEMO_PASSWORD__ por la contraseña de demostración
-- (la misma de DEMO_PASSWORD en .env.local). No subas al repositorio la versión con la contraseña.
--
-- Crea dos instituciones: "Colegio Futuro Andino" (demo principal) y "Colegio Demo Aislamiento"
-- (solo existe para las pruebas automáticas de separación entre colegios).

do $seed$
declare
  v_pw text := '__DEMO_PASSWORD__';
  v_inst uuid; v_inst2 uuid;
  v_period uuid; v_period2 uuid;
  u record; c record; s record; st record; a record;
  v_id uuid; v_course uuid; v_subject uuid; v_teacher uuid; v_assign uuid; v_case uuid; v_req uuid; v_tpl uuid; v_conv uuid;
  v_base numeric; v_score numeric; v_day date; v_h integer; v_status text; i integer;
  ids jsonb := '{}'::jsonb;
begin
  if exists (select 1 from public.institutions where name = 'Colegio Futuro Andino') then
    raise notice 'Los datos de demostración ya existen; no se vuelve a cargar.';
    return;
  end if;
  if v_pw like '\_\_DEMO%' then
    raise exception 'Reemplaza el marcador de contraseña antes de ejecutar el seed';
  end if;

  insert into public.institutions (name, rbd, dependency, commune, region, is_demo)
    values ('Colegio Futuro Andino', 'DEMO-0001', 'particular_subvencionado', 'Santiago', 'Región Metropolitana', true)
    returning id into v_inst;
  insert into public.institutions (name, rbd, dependency, commune, region, is_demo)
    values ('Colegio Demo Aislamiento', 'DEMO-0002', 'municipal', 'Valparaíso', 'Región de Valparaíso', true)
    returning id into v_inst2;
  insert into public.institution_settings (institution_id, urgent_protocol) values
    (v_inst, 'Ante una situación urgente, contacta de inmediato a Convivencia Escolar (anexo 120) y a la dirección del colegio. Si hay riesgo vital, llama al 131 (SAMU) o al 133 (Carabineros). Esta plataforma no reemplaza la atención de urgencia.'),
    (v_inst2, null);

  -- ── Usuarios ──────────────────────────────────────────────────────────────
  for u in
    select * from (values
      ('admin',  'admin@futuroandino.example',       'Carolina Vergara Soto',     'admin',      1, null::date),
      ('dir',    'direccion@futuroandino.example',   'Rodrigo Fuentes Araya',     'directivo',  1, null),
      ('doc1',   'mrojas@futuroandino.example',      'Marcela Rojas Pizarro',     'docente',    1, null),
      ('doc2',   'fcontreras@futuroandino.example',  'Felipe Contreras Muñoz',    'docente',    1, null),
      ('doc3',   'dsepulveda@futuroandino.example',  'Daniela Sepúlveda Lagos',   'docente',    1, null),
      ('bien',   'bienestar@futuroandino.example',   'Paula Henríquez Tapia',     'bienestar',  1, null),
      ('est01',  'est01@futuroandino.example',       'Martina Soto Vergara',      'estudiante', 1, date '2014-03-12'),
      ('est02',  'est02@futuroandino.example',       'Benjamín Castro Núñez',     'estudiante', 1, date '2014-07-30'),
      ('est03',  'est03@futuroandino.example',       'Sofía Morales Pino',        'estudiante', 1, date '2014-11-05'),
      ('est04',  'est04@futuroandino.example',       'Agustín Reyes Cárdenas',    'estudiante', 1, date '2014-01-22'),
      ('est05',  'est05@futuroandino.example',       'Florencia Navarro Díaz',    'estudiante', 1, date '2013-05-17'),
      ('est06',  'est06@futuroandino.example',       'Tomás Navarro Díaz',        'estudiante', 1, date '2013-05-17'),
      ('est07',  'est07@futuroandino.example',       'Isidora Castro Núñez',      'estudiante', 1, date '2013-09-09'),
      ('est08',  'est08@futuroandino.example',       'Vicente Reyes Cárdenas',    'estudiante', 1, date '2011-02-14'),
      ('est09',  'est09@futuroandino.example',       'Antonia Bravo Leiva',       'estudiante', 1, date '2011-08-21'),
      ('est10',  'est10@futuroandino.example',       'Matías Bravo Leiva',        'estudiante', 1, date '2011-08-21'),
      ('ap01',   'ap01@futuroandino.example',        'Claudia Núñez Riquelme',    'apoderado',  1, null),
      ('ap02',   'ap02@futuroandino.example',        'Jorge Soto Espinoza',       'apoderado',  1, null),
      ('ap03',   'ap03@futuroandino.example',        'Verónica Pino Salazar',     'apoderado',  1, null),
      ('ap04',   'ap04@futuroandino.example',        'Luis Reyes Maldonado',      'apoderado',  1, null),
      ('ap05',   'ap05@futuroandino.example',        'Andrea Díaz Figueroa',      'apoderado',  1, null),
      ('ap06',   'ap06@futuroandino.example',        'Héctor Bravo Saavedra',     'apoderado',  1, null),
      ('x_admin','admin@aislamiento.example',        'Admin Demo Aislamiento',    'admin',      2, null),
      ('x_doc',  'docente@aislamiento.example',      'Docente Demo Aislamiento',  'docente',    2, null),
      ('x_est',  'estudiante@aislamiento.example',   'Estudiante Demo Aislamiento','estudiante',2, date '2013-01-01')
    ) as t(key, email, full_name, role, inst, birth)
  loop
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u.email,
            extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u.full_name),
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now());
    update public.profiles set birth_date = u.birth where id = v_id;
    insert into public.institution_memberships (institution_id, user_id, role, is_managed)
    values (case u.inst when 1 then v_inst else v_inst2 end, v_id, u.role::public.member_role, u.role = 'estudiante');
    ids := ids || jsonb_build_object(u.key, v_id);
  end loop;

  -- ── Estructura académica ──────────────────────────────────────────────────
  insert into public.academic_periods (institution_id, name, year, starts_on, ends_on, is_current)
    values (v_inst, 'Segundo semestre', extract(year from current_date)::int,
            (current_date - 70), (current_date + 60), true) returning id into v_period;
  insert into public.academic_periods (institution_id, name, year, starts_on, ends_on, is_current)
    values (v_inst, 'Primer semestre', extract(year from current_date)::int,
            (current_date - 220), (current_date - 80), false);

  insert into public.grade_levels (institution_id, name, stage, sort_order) values
    (v_inst, '6.º básico', 'basica', 6), (v_inst, '7.º básico', 'basica', 7), (v_inst, '1.º medio', 'media', 9);
  insert into public.courses (institution_id, grade_level_id, period_id, section, name, head_teacher_id)
    select v_inst, gl.id, v_period, 'A', gl.name || ' A',
           (ids ->> case gl.sort_order when 6 then 'doc1' when 7 then 'doc2' else 'doc3' end)::uuid
    from public.grade_levels gl where gl.institution_id = v_inst;
  insert into public.subjects (institution_id, name, code) values
    (v_inst, 'Matemática', 'MAT'), (v_inst, 'Lenguaje y Comunicación', 'LEN'),
    (v_inst, 'Ciencias Naturales', 'CNA'), (v_inst, 'Historia', 'HIS');

  insert into public.teacher_assignments (institution_id, course_id, subject_id, teacher_id)
    select v_inst, co.id, su.id,
           (ids ->> case su.code when 'MAT' then 'doc1' when 'CNA' then 'doc1' when 'LEN' then 'doc2' else 'doc3' end)::uuid
    from public.courses co cross join public.subjects su
    where co.institution_id = v_inst and su.institution_id = v_inst;

  insert into public.course_enrollments (institution_id, course_id, student_id)
    select v_inst, co.id, (ids ->> e.key)::uuid
    from (values ('est01', '6.º básico A'), ('est02', '6.º básico A'), ('est03', '6.º básico A'), ('est04', '6.º básico A'),
                 ('est05', '7.º básico A'), ('est06', '7.º básico A'), ('est07', '7.º básico A'),
                 ('est08', '1.º medio A'), ('est09', '1.º medio A'), ('est10', '1.º medio A')) as e(key, course)
    join public.courses co on co.name = e.course and co.institution_id = v_inst;

  insert into public.guardian_student_links (institution_id, guardian_id, student_id, relationship, is_primary)
    select v_inst, (ids ->> l.g)::uuid, (ids ->> l.s)::uuid, l.rel, true
    from (values ('ap01', 'est02', 'madre'), ('ap01', 'est07', 'madre'), ('ap02', 'est01', 'padre'),
                 ('ap03', 'est03', 'madre'), ('ap04', 'est04', 'padre'), ('ap04', 'est08', 'padre'),
                 ('ap05', 'est05', 'madre'), ('ap05', 'est06', 'madre'),
                 ('ap06', 'est09', 'padre'), ('ap06', 'est10', 'padre')) as l(g, s, rel);

  -- ── Tareas, entregas y notas ──────────────────────────────────────────────
  -- En 7.º básico A, Matemática (fracciones y decimales) queda deliberadamente bajo: es la dificultad
  -- agregada que se usa en las demostraciones de ARIA Pedagógica y ARIA Gestión.
  for c in select co.id, co.name from public.courses co where co.institution_id = v_inst loop
    for s in select su.id, su.code, su.name from public.subjects su where su.institution_id = v_inst loop
      select ta.teacher_id into v_teacher from public.teacher_assignments ta where ta.course_id = c.id and ta.subject_id = s.id;
      for i in 1..3 loop
        insert into public.assignments (institution_id, course_id, subject_id, teacher_id, title, description, topic, due_at, status)
        values (v_inst, c.id, s.id, v_teacher,
          case s.code
            when 'MAT' then (array['Guía de fracciones equivalentes', 'Problemas con números decimales', 'Taller de proporcionalidad'])[i]
            when 'LEN' then (array['Comprensión lectora: texto informativo', 'Redacción de un texto argumentativo', 'Análisis de un cuento breve'])[i]
            when 'CNA' then (array['Informe de laboratorio: estados de la materia', 'Cuestionario sobre ecosistemas', 'Maqueta del sistema solar'])[i]
            else (array['Línea de tiempo: pueblos originarios', 'Ensayo breve sobre la Independencia', 'Mapa conceptual: organización política'])[i]
          end,
          'Actividad de demostración. Desarrolla el trabajo según las instrucciones entregadas en clases y sube tu respuesta en la plataforma.',
          case s.code
            when 'MAT' then (array['Fracciones', 'Números decimales', 'Proporcionalidad'])[i]
            when 'LEN' then (array['Comprensión lectora', 'Producción de textos', 'Análisis literario'])[i]
            when 'CNA' then (array['Materia', 'Ecosistemas', 'Sistema solar'])[i]
            else (array['Pueblos originarios', 'Independencia', 'Organización política'])[i]
          end,
          case i when 1 then now() - interval '24 days' when 2 then now() - interval '9 days' else now() + interval '6 days' end,
          'published')
        returning id into v_assign;

        v_base := case
          when c.name = '7.º básico A' and s.code = 'MAT' then 3.7
          when s.code = 'MAT' then 5.1 when s.code = 'LEN' then 5.6 when s.code = 'CNA' then 5.4 else 5.8 end;

        for st in select e.student_id from public.course_enrollments e where e.course_id = c.id loop
          v_h := abs(hashtext(st.student_id::text || v_assign::text));
          if i < 3 then
            if v_h % 11 <> 0 then   -- algunas entregas faltan a propósito
              insert into public.assignment_submissions (institution_id, assignment_id, student_id, content, submitted_at)
              values (v_inst, v_assign, st.student_id, 'Respuesta de demostración entregada por el estudiante.',
                      now() - (case i when 1 then interval '25 days' else interval '10 days' end));
              v_score := round(least(7.0, greatest(1.5, v_base + ((v_h % 21) - 10) / 10.0
                          + (abs(hashtext(st.student_id::text)) % 9 - 4) / 10.0))::numeric, 1);
              insert into public.grades (institution_id, student_id, course_id, subject_id, assignment_id, score, feedback, graded_by, graded_at)
              values (v_inst, st.student_id, c.id, s.id, v_assign, v_score,
                      case when v_score < 4.0 then 'Revisemos juntos los pasos del procedimiento; te dejé material de refuerzo.'
                           when v_score < 5.5 then 'Buen avance. Cuida el orden del desarrollo y revisa tus resultados.'
                           else 'Muy buen trabajo, desarrollo claro y completo.' end,
                      v_teacher, now() - (case i when 1 then interval '20 days' else interval '6 days' end));
            end if;
          elsif v_h % 3 = 0 then
            insert into public.assignment_submissions (institution_id, assignment_id, student_id, content, submitted_at)
            values (v_inst, v_assign, st.student_id, 'Entrega de demostración pendiente de revisión.', now() - interval '1 day');
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  -- ── Asistencia: últimos 20 días hábiles ───────────────────────────────────
  for c in select co.id, co.head_teacher_id from public.courses co where co.institution_id = v_inst loop
    for st in select e.student_id from public.course_enrollments e where e.course_id = c.id loop
      for i in 1..28 loop
        v_day := current_date - i;
        continue when extract(isodow from v_day) > 5;
        v_h := abs(hashtext(st.student_id::text || v_day::text)) % 100;
        if st.student_id = (ids ->> 'est06')::uuid then
          v_status := case when v_h < 62 then 'present' when v_h < 85 then 'absent' when v_h < 93 then 'late' else 'justified' end;
        else
          v_status := case when v_h < 90 then 'present' when v_h < 95 then 'absent' when v_h < 98 then 'late' else 'justified' end;
        end if;
        insert into public.attendance_records (institution_id, course_id, student_id, date, status, recorded_by)
        values (v_inst, c.id, st.student_id, v_day, v_status, c.head_teacher_id);
      end loop;
    end loop;
  end loop;

  -- ── Comunicados y mensajes ────────────────────────────────────────────────
  insert into public.announcements (institution_id, author_id, title, body, audience, published_at) values
    (v_inst, (ids ->> 'dir')::uuid, 'Reunión de apoderados del segundo semestre',
     'Estimadas familias: la reunión de apoderados se realizará el próximo jueves a las 18:30 h en cada sala. Se revisará el avance académico y el calendario de evaluaciones. (Comunicado de demostración.)',
     '{apoderado,docente}', now() - interval '3 days'),
    (v_inst, (ids ->> 'admin')::uuid, 'Semana de la convivencia escolar',
     'Durante la próxima semana se realizarán actividades de convivencia escolar en todos los cursos. Los horarios se informarán por curso. (Comunicado de demostración.)',
     '{apoderado,docente,estudiante,bienestar,directivo}', now() - interval '6 days'),
    (v_inst, (ids ->> 'dir')::uuid, 'Calendario de evaluaciones',
     'Ya está disponible el calendario de evaluaciones del semestre. Revisen las fechas de sus asignaturas en la sección de tareas. (Comunicado de demostración.)',
     '{estudiante,apoderado}', now() - interval '10 days');

  select co.id into v_course from public.courses co where co.institution_id = v_inst and co.name = '7.º básico A';
  insert into public.announcements (institution_id, author_id, course_id, title, body, audience, published_at)
    values (v_inst, (ids ->> 'doc1')::uuid, v_course, 'Refuerzo de Matemática',
            'Los martes después de clases habrá taller de refuerzo de fracciones y decimales en la sala 12. (Comunicado de demostración.)',
            '{estudiante,apoderado}', now() - interval '2 days');

  insert into public.conversations (institution_id, subject, student_id, created_by, last_message_at)
    values (v_inst, 'Consulta por la guía de fracciones', (ids ->> 'est06')::uuid, (ids ->> 'ap05')::uuid, now() - interval '1 day')
    returning id into v_conv;
  insert into public.conversation_participants (conversation_id, user_id, last_read_at) values
    (v_conv, (ids ->> 'ap05')::uuid, now()), (v_conv, (ids ->> 'doc1')::uuid, now() - interval '2 days');
  insert into public.messages (institution_id, conversation_id, sender_id, body, created_at) values
    (v_inst, v_conv, (ids ->> 'ap05')::uuid, 'Buenas tardes, profesora. Tomás tuvo dificultades con la guía de fracciones. ¿Hay material de apoyo para practicar en casa?', now() - interval '2 days'),
    (v_inst, v_conv, (ids ->> 'doc1')::uuid, 'Buenas tardes. Sí, subiré una guía de refuerzo y lo espero en el taller de los martes. Gracias por escribir.', now() - interval '1 day');

  -- ── Bienestar (casos ficticios) ───────────────────────────────────────────
  insert into public.wellbeing_requests (institution_id, student_id, requested_by, source, category, description, status, created_at)
    values (v_inst, (ids ->> 'est09')::uuid, (ids ->> 'est09')::uuid, 'estudiante', 'emocional',
            'Me he sentido con mucha carga por las evaluaciones y me cuesta organizarme. Me gustaría conversar con alguien del equipo. (Solicitud ficticia de demostración.)',
            'pending', now() - interval '1 day');
  insert into public.wellbeing_requests (institution_id, student_id, requested_by, source, category, description, status, created_at)
    values (v_inst, (ids ->> 'est03')::uuid, (ids ->> 'doc2')::uuid, 'docente', 'convivencia',
            'He observado que la estudiante se ha aislado del grupo durante los trabajos colaborativos en las últimas semanas. Derivo para orientación. (Derivación ficticia de demostración.)',
            'pending', now() - interval '3 days');
  insert into public.wellbeing_requests (institution_id, student_id, requested_by, source, category, description, status,
                                         priority, priority_set_by, assigned_to, created_at)
    values (v_inst, (ids ->> 'est06')::uuid, (ids ->> 'ap05')::uuid, 'apoderado', 'academico',
            'Tomás ha tenido dificultades persistentes para completar sus actividades y ha faltado varias veces. Solicito orientación. (Solicitud ficticia de demostración.)',
            'in_follow_up', 'media', (ids ->> 'bien')::uuid, (ids ->> 'bien')::uuid, now() - interval '18 days')
    returning id into v_req;
  insert into public.wellbeing_cases (institution_id, student_id, request_id, opened_by, responsible_id, status, summary, follow_up_on, created_at)
    values (v_inst, (ids ->> 'est06')::uuid, v_req, (ids ->> 'bien')::uuid, (ids ->> 'bien')::uuid, 'follow_up',
            'Acompañamiento por dificultades para completar actividades e inasistencias reiteradas. Se acuerda trabajo coordinado con la familia y la profesora de Matemática. (Caso ficticio de demostración.)',
            current_date + 5, now() - interval '16 days')
    returning id into v_case;
  insert into public.wellbeing_interventions (institution_id, case_id, professional_id, kind, notes, occurred_on, next_follow_up_on) values
    (v_inst, v_case, (ids ->> 'bien')::uuid, 'entrevista',
     'Entrevista inicial con el estudiante. Refiere dificultad para organizar sus tiempos de estudio y cansancio en las mañanas. Se acuerda una rutina semanal simple. (Registro ficticio.)',
     current_date - 15, current_date - 8),
    (v_inst, v_case, (ids ->> 'bien')::uuid, 'reunion_apoderado',
     'Reunión con la apoderada. Se revisan horarios de sueño y un espacio fijo de estudio en casa. La familia se compromete a avisar las inasistencias. (Registro ficticio.)',
     current_date - 8, current_date + 5);

  insert into public.assessment_templates (institution_id, title, description, authorization_note, questions, scoring_rule, status, created_by)
    values (v_inst, 'Pauta de hábitos de estudio (demostración)',
            'Pauta interna de observación, creada solo para demostrar la plataforma. No es un instrumento clínico ni está validada.',
            'Instrumento ficticio de demostración. No usar con estudiantes reales.',
            '[{"id":"q1","text":"Cuenta con un horario de estudio definido","type":"scale","min":1,"max":5},
              {"id":"q2","text":"Dispone de un espacio tranquilo para estudiar","type":"scale","min":1,"max":5},
              {"id":"q3","text":"Registra sus tareas y fechas de entrega","type":"scale","min":1,"max":5},
              {"id":"q4","text":"Observaciones del profesional","type":"text"}]'::jsonb,
            '{"type":"mean","note":"Promedio simple de las preguntas de escala (1 a 5). Es un valor descriptivo para orientar la conversación; no tiene puntos de corte ni significado diagnóstico."}'::jsonb,
            'active', (ids ->> 'bien')::uuid)
    returning id into v_tpl;
  insert into public.assessment_responses (institution_id, template_id, case_id, student_id, administered_by, answers, computed_score,
                                           professional_review, recommendations, reviewed_by, reviewed_at, follow_up_on)
    values (v_inst, v_tpl, v_case, (ids ->> 'est06')::uuid, (ids ->> 'bien')::uuid,
            '{"q1":2,"q2":4,"q3":2,"q4":"Se distrae con el teléfono al estudiar; muestra buena disposición."}'::jsonb, 2.67,
            'Los hábitos de organización aparecen como el aspecto a reforzar. No se observan otros antecedentes en esta pauta. (Registro ficticio.)',
            'Acordar un horario breve y fijo de estudio; usar agenda semanal; revisar avances en 2 semanas.',
            (ids ->> 'bien')::uuid, now() - interval '7 days', current_date + 5);

  insert into public.improvement_strategies (institution_id, title, description, status, review_on, origin, created_by,
                                             subject_id, course_id)
    select v_inst, 'Taller de refuerzo de fracciones en 7.º básico',
           'Taller semanal de 45 minutos con material concreto y guías graduadas. Se evaluará el avance con la siguiente actividad calificada. (Estrategia de demostración.)',
           'in_progress', current_date + 21, 'manual', (ids ->> 'dir')::uuid, su.id, v_course
    from public.subjects su where su.institution_id = v_inst and su.code = 'MAT';

  insert into public.audit_logs (institution_id, actor_id, action, entity, metadata)
    values (v_inst, (ids ->> 'admin')::uuid, 'demo.seed', 'institution', '{"nota":"Carga inicial de datos de demostración"}');

  -- ── Segunda institución: solo para probar el aislamiento ──────────────────
  insert into public.academic_periods (institution_id, name, year, starts_on, ends_on, is_current)
    values (v_inst2, 'Segundo semestre', extract(year from current_date)::int, current_date - 70, current_date + 60, true)
    returning id into v_period2;
  insert into public.grade_levels (institution_id, name, stage, sort_order) values (v_inst2, '8.º básico', 'basica', 8) returning id into v_id;
  insert into public.courses (institution_id, grade_level_id, period_id, section, name)
    values (v_inst2, v_id, v_period2, 'A', '8.º básico A') returning id into v_course;
  insert into public.subjects (institution_id, name, code) values (v_inst2, 'Matemática', 'MAT') returning id into v_subject;
  insert into public.teacher_assignments (institution_id, course_id, subject_id, teacher_id)
    values (v_inst2, v_course, v_subject, (ids ->> 'x_doc')::uuid);
  insert into public.course_enrollments (institution_id, course_id, student_id)
    values (v_inst2, v_course, (ids ->> 'x_est')::uuid);
  insert into public.assignments (institution_id, course_id, subject_id, teacher_id, title, due_at, status)
    values (v_inst2, v_course, v_subject, (ids ->> 'x_doc')::uuid, 'Tarea del colegio aislado', now() + interval '5 days', 'published')
    returning id into v_assign;
  insert into public.grades (institution_id, student_id, course_id, subject_id, assignment_id, score, graded_by)
    values (v_inst2, (ids ->> 'x_est')::uuid, v_course, v_subject, v_assign, 6.0, (ids ->> 'x_doc')::uuid);
  insert into public.wellbeing_requests (institution_id, student_id, requested_by, source, category, description)
    values (v_inst2, (ids ->> 'x_est')::uuid, (ids ->> 'x_est')::uuid, 'estudiante', 'otro', 'Solicitud ficticia del colegio aislado.');
end
$seed$;
