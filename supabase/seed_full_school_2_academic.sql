-- seed_full_school_2_academic.sql — Colegio completo de demostración (parte 2: tareas, evaluaciones, entregas y notas).
-- TODOS los datos son ficticios. Se ejecuta después de la parte 1, una sola vez.
-- Año escolar 2026: primer semestre cerrado (2 tareas, 2 pruebas y examen por asignatura principal) y segundo semestre
-- en curso al 11 de octubre (tarea y prueba ya calificadas, un taller reciente, una guía por entregar y una prueba próxima).
-- Orientación y Religión no llevan nota (se evalúan con conceptos), así que no generan tareas.

do $seed$
declare
  v_inst uuid := (select id from public.institutions where name = 'Colegio Futuro Andino');
begin
  if exists (select 1 from public.assignments where institution_id = v_inst and title = 'Examen del primer semestre') then
    raise notice 'Las tareas y notas del colegio completo ya están cargadas.'; return;
  end if;
  alter table public.assignments disable trigger user;
  alter table public.assignment_submissions disable trigger user;
  alter table public.grades disable trigger user;

  create temp table _plan (core boolean, ord int, kind text, prefix text, u int, base date, graded boolean) on commit drop;
  insert into _plan values
    (true, 1, 'tarea', 'Guía de ejercicios', 1, '2026-03-27', true), (true, 2, 'prueba', 'Prueba', 1, '2026-04-17', true),
    (true, 3, 'tarea', 'Trabajo de investigación', 2, '2026-05-15', true), (true, 4, 'prueba', 'Prueba', 2, '2026-06-05', true),
    (true, 5, 'examen', 'Examen del primer semestre', null, '2026-06-22', true),
    (true, 6, 'tarea', 'Guía de trabajo', 3, '2026-08-14', true), (true, 7, 'prueba', 'Prueba', 3, '2026-09-04', true),
    (true, 8, 'tarea', 'Taller en clases', 4, '2026-09-28', true),
    (true, 9, 'tarea', 'Guía de repaso', 4, '2026-10-14', false), (true, 10, 'prueba', 'Prueba', 4, '2026-10-26', false),
    (false, 1, 'tarea', 'Trabajo práctico', 1, '2026-04-24', true), (false, 2, 'tarea', 'Trabajo práctico', 2, '2026-06-12', true),
    (false, 3, 'tarea', 'Trabajo práctico', 3, '2026-09-04', true), (false, 4, 'tarea', 'Trabajo práctico', 4, '2026-10-21', false);

  -- Unidades por asignatura y tramo (1: 1.º–4.º básico · 2: 5.º–8.º básico · 3: enseñanza media · 0: cualquiera).
  create temp table _unit (code text, band int, u text[], base numeric) on commit drop;
  insert into _unit values
    ('LEN', 1, array['Lectura de cuentos', 'Escritura de oraciones y textos breves', 'Comprensión de textos informativos', 'Poemas y rimas'], 5.4),
    ('LEN', 2, array['Textos narrativos', 'Textos informativos', 'Texto argumentativo', 'Poesía y lenguaje figurado'], 5.3),
    ('LYL', 2, array['El héroe en la literatura', 'Texto argumentativo', 'Medios de comunicación', 'Género lírico'], 5.2),
    ('LYL', 3, array['Narrativa contemporánea', 'Argumentación y debate', 'Género dramático', 'Análisis crítico de medios'], 5.2),
    ('MAT', 1, array['Números y conteo', 'Adición y sustracción', 'Figuras geométricas', 'Medición y datos'], 5.3),
    ('MAT', 2, array['Fracciones y decimales', 'Proporcionalidad', 'Ecuaciones', 'Geometría y área'], 4.9),
    ('MAT', 3, array['Números reales y potencias', 'Álgebra y funciones', 'Geometría y trigonometría', 'Probabilidad y estadística'], 4.8),
    ('CNA', 1, array['Seres vivos y su entorno', 'El cuerpo humano', 'Materiales y sus cambios', 'El sistema solar'], 5.5),
    ('CNA', 2, array['Célula y sistemas del cuerpo', 'Materia y sus estados', 'Fuerza y movimiento', 'Ecosistemas'], 5.3),
    ('CNA', 3, array['Evolución y biodiversidad', 'Reacciones químicas', 'Ondas, luz y sonido', 'Materia y energía en los ecosistemas'], 5.1),
    ('HIS', 1, array['Mi familia y mi comunidad', 'Pueblos originarios de Chile', 'Paisajes y mapas', 'Normas y convivencia'], 5.6),
    ('HIS', 2, array['Civilizaciones antiguas', 'Conquista y Colonia', 'Independencia de Chile', 'Geografía de Chile'], 5.4),
    ('HIS', 3, array['Estado nación y siglo XIX', 'Guerras mundiales', 'Chile en el siglo XX', 'Democracia y derechos humanos'], 5.3),
    ('ING', 1, array['Greetings and family', 'Colors, numbers and animals', 'My school', 'Food and daily routines'], 5.6),
    ('ING', 2, array['Daily routines', 'Past experiences', 'Places and travel', 'Future plans'], 5.3),
    ('ING', 3, array['Global issues', 'Technology and media', 'Jobs and the future', 'Culture and identity'], 5.2),
    ('ART', 0, array['Color y forma', 'Dibujo y composición', 'Arte chileno', 'Proyecto de creación'], 6.1),
    ('MUS', 0, array['Ritmo y pulso', 'Canto e interpretación', 'Música chilena y latinoamericana', 'Creación musical'], 6.2),
    ('EFI', 0, array['Habilidades motrices', 'Deportes colectivos', 'Vida activa y saludable', 'Juegos y expresión corporal'], 6.3),
    ('TEC', 0, array['Diseño de objetos', 'Herramientas digitales', 'Proyecto tecnológico', 'Tecnología y medioambiente'], 6.0),
    ('EDC', 0, array['Democracia y participación', 'Derechos humanos', 'Instituciones del Estado', 'Ciudadanía digital'], 5.5),
    ('FIL', 0, array['La pregunta filosófica', 'Ética y moral', 'Conocimiento y verdad', 'Filosofía política'], 5.2),
    ('CPC', 0, array['Bienestar y salud', 'Seguridad y prevención', 'Ambiente y sostenibilidad', 'Tecnología y sociedad'], 5.5);

  create temp table _had on commit drop as select distinct course_id, subject_id from public.assignments where institution_id = v_inst;

  create temp table _a on commit drop as
    select gen_random_uuid() as id, cs.course_id, cs.subject_id, ta.teacher_id, s.code, p.ord, p.graded, c.name as course_name, un.base,
           case when s.code in ('EFI', 'MUS') then 'control' else p.kind end as kind,
           case when p.u is null then p.prefix when s.code in ('EFI', 'MUS') then 'Evaluación práctica: ' || un.u[p.u] else p.prefix || ': ' || un.u[p.u] end as title,
           un.u[p.u] as topic,
           -- Un taller reciente queda entregado pero aún sin corregir en uno de cada cuatro cursos: trabajo pendiente del docente.
           (p.core and p.ord = 8 and abs(hashtext(cs.course_id::text || cs.subject_id::text)) % 4 = 0) as pend,
           ((d.dd + case when p.kind = 'tarea' and s.code not in ('EFI', 'MUS') then time '23:59' else time '10:00' end) at time zone 'America/Santiago') as due_at
    from public.course_subjects cs
    join public.courses c on c.id = cs.course_id and c.institution_id = v_inst and c.is_archived = false
    join public.grade_levels gl on gl.id = c.grade_level_id and gl.stage in ('basica', 'media')
    join public.subjects s on s.id = cs.subject_id and s.code not in ('ORI', 'REL')
    join public.teacher_assignments ta on ta.course_id = cs.course_id and ta.subject_id = cs.subject_id
    cross join lateral (select case gl.stage when 'media' then 8 else 0 end + (regexp_match(gl.name, '\d+'))[1]::int as gnum) g
    join _unit un on un.code = s.code and un.band in (0, case when g.gnum <= 4 then 1 when g.gnum <= 8 then 2 else 3 end)
    join _plan p on p.core = (s.code not in ('ART', 'MUS', 'EFI', 'TEC'))
    cross join lateral (select p.base + (abs(hashtext(s.code)) % 5) as d0) q
    cross join lateral (select q.d0 + case extract(isodow from q.d0) when 6 then 2 when 7 then 1 else 0 end as dd) d
    -- Los cursos de demostración ya tenían tareas del segundo semestre en sus asignaturas: ahí solo se agrega el primero.
    where not (exists (select 1 from _had h where h.course_id = cs.course_id and h.subject_id = cs.subject_id)
               and p.ord > case when p.core then 5 else 2 end);

  insert into public.assignments (id, institution_id, course_id, subject_id, teacher_id, title, description, topic, due_at, status, kind, created_at)
    select id, v_inst, course_id, subject_id, teacher_id, title,
           case when kind = 'tarea' then 'Actividad de demostración. Desarrolla el trabajo según las instrucciones de clases y súbelo a la plataforma.'
                else 'Evaluación de demostración. Se rinde en clases, en la fecha indicada.' end,
           topic, due_at, 'published', kind, due_at - interval '28 days'
    from _a;

  create temp table _x on commit drop as
    select a.*, e.student_id, abs(hashtext(e.student_id::text || a.id::text)) as hi,
           -- Rendimiento propio de cada estudiante (parejo entre asignaturas) más un efecto leve del curso.
           ((abs(hashtext(e.student_id::text)) % 100) + (abs(hashtext('b' || e.student_id::text)) % 100)) / 200.0 - 0.5 as ability,
           (abs(hashtext(a.course_id::text)) % 7 - 3) / 10.0 as course_fx,
           -- Uno de cada diez estudiantes deja tareas sin entregar; el resto las entrega todas.
           (abs(hashtext('m' || e.student_id::text)) % 10 = 0) as flaky
    from _a a join public.course_enrollments e on e.course_id = a.course_id and e.status = 'active';

  insert into public.assignment_submissions (institution_id, assignment_id, student_id, content, submitted_at)
    select v_inst, id, student_id,
           case when graded and not pend then 'Respuesta de demostración entregada por el estudiante.' else 'Entrega de demostración pendiente de revisión.' end,
           case when graded then due_at - make_interval(hours => 4 + hi % 60) else now() - make_interval(hours => 3 + hi % 48) end
    from _x where kind = 'tarea' and ((graded and (not flaky or hi % 17 <> 0)) or (not graded and hi % 100 < 10));

  insert into public.grades (institution_id, student_id, course_id, subject_id, assignment_id, score, feedback, graded_by, graded_at)
    select v_inst, student_id, course_id, subject_id, id, score,
           case when score < 4.0 then 'Revisemos juntos los contenidos; te dejé material de refuerzo.'
                when score < 5.5 then 'Buen avance. Cuida el orden del desarrollo y revisa tus resultados.'
                else 'Muy buen trabajo, desarrollo claro y completo.' end,
           teacher_id, least(due_at + interval '5 days', now() - interval '1 day')
    from (select x.*, round(least(7.0, greatest(1.5,
              (case when course_name = '7.º básico A' and code = 'MAT' then 3.9 else base end)
              + ability * 3.2 + course_fx + ((hi % 21) - 10) / 10.0 - case when kind in ('prueba', 'examen') then 0.2 else 0 end))::numeric, 1) as score
          from _x x) y
    where graded and not pend and ((kind = 'tarea' and (not flaky or hi % 17 <> 0)) or (kind <> 'tarea' and hi % 50 <> 0));

  alter table public.assignments enable trigger user;
  alter table public.assignment_submissions enable trigger user;
  alter table public.grades enable trigger user;
end
$seed$;

-- Las tareas que ya existían en los cursos de demostración solo tenían entregas de sus estudiantes originales:
-- se completan para los compañeros nuevos, con una nota cercana a su promedio en la asignatura.
do $fix$
declare v_inst uuid := (select id from public.institutions where name = 'Colegio Futuro Andino');
begin
  alter table public.assignment_submissions disable trigger user;
  alter table public.grades disable trigger user;
  create temp table _m on commit drop as
    select a.id as aid, a.course_id, a.subject_id, a.teacher_id, a.due_at, e.student_id, abs(hashtext(e.student_id::text || a.id::text)) as hi
    from public.assignments a join public.course_enrollments e on e.course_id = a.course_id and e.status = 'active'
    join public.profiles p on p.id = e.student_id and p.email like 'alumno%@futuroandino.example'
    where a.institution_id = v_inst and a.kind = 'tarea' and a.status = 'published' and a.due_at < now()
      and a.description not like 'Actividad de demostración. Desarrolla el trabajo según las instrucciones de clases%'
      and exists (select 1 from public.grades g where g.assignment_id = a.id)
      and not exists (select 1 from public.assignment_submissions s where s.assignment_id = a.id and s.student_id = e.student_id)
      and (abs(hashtext('m' || e.student_id::text)) % 10 <> 0 or abs(hashtext(e.student_id::text || a.id::text)) % 17 <> 0);
  insert into public.assignment_submissions (institution_id, assignment_id, student_id, content, submitted_at)
    select v_inst, aid, student_id, 'Respuesta de demostración entregada por el estudiante.', due_at - interval '9 hours' from _m;
  insert into public.grades (institution_id, student_id, course_id, subject_id, assignment_id, score, feedback, graded_by, graded_at)
    select v_inst, m.student_id, m.course_id, m.subject_id, m.aid, sc.score,
           case when sc.score < 4.0 then 'Revisemos juntos los contenidos; te dejé material de refuerzo.' when sc.score < 5.5 then 'Buen avance. Cuida el orden del desarrollo y revisa tus resultados.' else 'Muy buen trabajo, desarrollo claro y completo.' end,
           m.teacher_id, least(m.due_at + interval '4 days', now() - interval '1 day')
    from _m m cross join lateral (select round(least(7.0, greatest(1.5, coalesce((select avg(g.score) from public.grades g where g.student_id = m.student_id and g.subject_id = m.subject_id and g.course_id = m.course_id), 5.2) + ((m.hi % 11) - 5) / 10.0))::numeric, 1) as score) sc;
  alter table public.assignment_submissions enable trigger user;
  alter table public.grades enable trigger user;
end $fix$;
