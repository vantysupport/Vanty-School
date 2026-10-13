-- 0016_year_close.sql — Cierre de año escolar: promoción automática, repitencia, retiro y egreso (exalumnos por promoción).
-- Cada matrícula activa lleva una decisión de continuidad. Al cerrar el año, en una sola transacción:
--   · quien continúa pasa al grado siguiente, misma sección (la sección se crea si no existe, con el plan del año anterior);
--   · quien repite queda en el mismo grado y sección del año nuevo;
--   · quien no continúa queda con la matrícula retirada;
--   · quien termina el último grado egresa y queda como exalumno de la promoción de ese año.
-- Nada se borra: notas, asistencia y cursos del año cerrado se conservan como historial.

do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.course_enrollments'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%' loop
    execute format('alter table public.course_enrollments drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.course_enrollments
  add constraint course_enrollments_status_check check (status in ('active', 'withdrawn', 'promoted', 'retained', 'graduated')),
  add column continuity text not null default 'pending' check (continuity in ('pending', 'promote', 'repeat', 'leave')),
  add column closed_at timestamptz;

alter table public.courses add column is_archived boolean not null default false;   -- cursos de años ya cerrados

-- Exalumnos, agrupados por año de egreso («Promoción 2026»).
create table public.alumni (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  graduation_year integer not null check (graduation_year between 2000 and 2100),
  last_course text not null,
  graduated_at timestamptz not null default now(),
  primary key (institution_id, student_id)
);
create index alumni_year_idx on public.alumni (institution_id, graduation_year desc);

-- Quién impartió qué en los años cerrados. Las asignaciones vigentes viven solo en teacher_assignments.
create table public.teacher_assignments_archive (
  id uuid primary key,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null,
  archived_at timestamptz not null default now()
);

alter table public.alumni enable row level security;
alter table public.teacher_assignments_archive enable row level security;
revoke all on public.alumni, public.teacher_assignments_archive from anon, authenticated;
grant select on public.alumni, public.teacher_assignments_archive to authenticated;
create policy alumni_select on public.alumni for select to authenticated
  using (app.is_member(institution_id) and (student_id = (select auth.uid()) or app.has_role(institution_id, 'admin', 'directivo')));
create policy teacher_archive_select on public.teacher_assignments_archive for select to authenticated
  using (app.has_role(institution_id, 'admin', 'directivo') or teacher_id = (select auth.uid()));

/** Cierra el año vigente y abre el periodo indicado. Solo administración. Exige que toda matrícula activa tenga una decisión. */
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
    select e.id, e.student_id, e.continuity, c.section, c.name as course_name, c.capacity, gl.id as level_id, gl.sort_order, gl.name as level_name
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
        if v_template is not null then
          insert into public.course_subjects (institution_id, course_id, subject_id)
            select p_inst, v_course, cs.subject_id from public.course_subjects cs where cs.course_id = v_template on conflict do nothing;
        end if;
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
revoke execute on function public.close_school_year(uuid, uuid) from public, anon;
grant execute on function public.close_school_year(uuid, uuid) to authenticated;
