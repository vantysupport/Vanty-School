-- 0006_integrity.sql — Integridad entre instituciones y ajustes de permisos.
-- Las claves foráneas garantizan que un registro existe, no que pertenezca al mismo colegio. Sin estas
-- comprobaciones, el administrador de un colegio podría apuntar una fila propia a un curso ajeno y, con ello,
-- abrirse acceso a datos de otro establecimiento. Estos disparadores lo impiden para cualquier vía de escritura.

-- Cada par (columna, tabla) de TG_ARGV debe referenciar una fila de la misma institución.
create or replace function app.check_same_institution() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  i integer := 0;
  v_ref uuid;
  v_inst uuid;
begin
  while i < tg_nargs loop
    v_ref := (to_jsonb(new) ->> tg_argv[i])::uuid;
    if v_ref is not null then
      execute format('select institution_id from public.%I where id = $1', tg_argv[i + 1]) into v_inst using v_ref;
      if v_inst is distinct from new.institution_id then
        raise exception 'El registro referenciado en % no pertenece a esta institución', tg_argv[i] using errcode = '42501';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end $$;

-- Cada columna de TG_ARGV debe referenciar a una persona con pertenencia en la misma institución.
create or replace function app.check_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  i integer := 0;
  v_user uuid;
begin
  while i < tg_nargs loop
    v_user := (to_jsonb(new) ->> tg_argv[i])::uuid;
    if v_user is not null and not exists (
      select 1 from public.institution_memberships m where m.institution_id = new.institution_id and m.user_id = v_user
    ) then
      raise exception 'La persona indicada en % no pertenece a esta institución', tg_argv[i] using errcode = '42501';
    end if;
    i := i + 1;
  end loop;
  return new;
end $$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('courses',                 'grade_level_id,grade_levels,period_id,academic_periods'),
    ('course_enrollments',      'course_id,courses'),
    ('teacher_assignments',     'course_id,courses,subject_id,subjects'),
    ('assignments',             'course_id,courses,subject_id,subjects'),
    ('assignment_submissions',  'assignment_id,assignments'),
    ('grades',                  'course_id,courses,subject_id,subjects,assignment_id,assignments'),
    ('attendance_records',      'course_id,courses'),
    ('announcements',           'course_id,courses'),
    ('resources',               'course_id,courses,subject_id,subjects'),
    ('improvement_strategies',  'course_id,courses,subject_id,subjects'),
    ('invitations',             'course_id,courses'),
    ('messages',                'conversation_id,conversations'),
    ('wellbeing_cases',         'request_id,wellbeing_requests'),
    ('wellbeing_interventions', 'case_id,wellbeing_cases'),
    ('assessment_responses',    'template_id,assessment_templates,case_id,wellbeing_cases')
  ) as t(tbl, args) loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function app.check_same_institution(%s)',
      r.tbl || '_same_inst', r.tbl, (select string_agg(quote_literal(a), ', ') from unnest(string_to_array(r.args, ',')) a));
  end loop;

  for r in select * from (values
    ('courses',                'head_teacher_id'),
    ('course_enrollments',     'student_id'),
    ('teacher_assignments',    'teacher_id'),
    ('guardian_student_links', 'guardian_id,student_id'),
    ('assignments',            'teacher_id'),
    ('grades',                 'student_id'),
    ('attendance_records',     'student_id'),
    ('wellbeing_requests',     'student_id,assigned_to'),
    ('wellbeing_cases',        'student_id,responsible_id'),
    ('assessment_responses',   'student_id')
  ) as t(tbl, args) loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function app.check_member(%s)',
      r.tbl || '_member', r.tbl, (select string_agg(quote_literal(a), ', ') from unnest(string_to_array(r.args, ',')) a));
  end loop;
end $$;

revoke execute on function app.check_same_institution(), app.check_member() from public, anon;

-- Un participante solo puede marcar su conversación como leída; no puede "moverse" a otra conversación.
revoke update on public.conversation_participants from authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;

-- El equipo directivo necesita saber cuántas entregas hubo (indicador agregado de actividad académica).
drop policy submissions_select on public.assignment_submissions;
create policy submissions_select on public.assignment_submissions for select to authenticated
  using (student_id = (select auth.uid()) or app.is_guardian_of(student_id)
         or app.has_role(institution_id, 'admin', 'directivo') or app.teaches_assignment(assignment_id));
