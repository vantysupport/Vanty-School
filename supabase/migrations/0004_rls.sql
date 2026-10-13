-- 0004_rls.sql — Funciones de autorización y políticas RLS.
-- Reglas de diseño:
--   · Todo acceso exige una pertenencia ACTIVA a la institución de la fila (suspender a alguien corta el acceso al instante).
--   · anon no tiene privilegios sobre ninguna tabla.
--   · Bienestar es un compartimento aparte: administrador y directivo no tienen políticas sobre esas tablas.
--   · Las funciones auxiliares viven en el esquema "app", que la API no expone.

-- ── Funciones auxiliares ────────────────────────────────────────────────────
create or replace function app.my_role(p_inst uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role::text
  from public.institution_memberships m
  join public.institutions i on i.id = m.institution_id
  where m.institution_id = p_inst and m.user_id = (select auth.uid())
    and m.status = 'active' and i.status = 'active'
$$;

create or replace function app.is_member(p_inst uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.my_role(p_inst) is not null
$$;

create or replace function app.has_role(p_inst uuid, variadic p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.my_role(p_inst) = any (p_roles), false)
$$;

create or replace function app.course_inst(p_course uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select institution_id from public.courses where id = p_course
$$;

create or replace function app.teaches(p_course uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacher_assignments ta
    where ta.course_id = p_course and ta.subject_id = p_subject and ta.teacher_id = (select auth.uid())
      and app.has_role(ta.institution_id, 'docente'))
$$;

create or replace function app.teaches_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacher_assignments ta
    where ta.course_id = p_course and ta.teacher_id = (select auth.uid())
      and app.has_role(ta.institution_id, 'docente'))
$$;

create or replace function app.teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_enrollments e
    join public.teacher_assignments ta on ta.course_id = e.course_id
    where e.student_id = p_student and e.status = 'active' and ta.teacher_id = (select auth.uid())
      and app.has_role(ta.institution_id, 'docente'))
$$;

create or replace function app.teaches_assignment(p_assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.assignments a where a.id = p_assignment and app.teaches(a.course_id, a.subject_id))
$$;

create or replace function app.is_guardian_of(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.guardian_student_links l
    where l.student_id = p_student and l.guardian_id = (select auth.uid())
      and app.has_role(l.institution_id, 'apoderado'))
$$;

create or replace function app.is_enrolled(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_enrollments e
    where e.course_id = p_course and e.student_id = (select auth.uid()) and e.status = 'active'
      and app.has_role(e.institution_id, 'estudiante'))
$$;

create or replace function app.guardian_in_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_enrollments e
    where e.course_id = p_course and e.status = 'active' and app.is_guardian_of(e.student_id))
$$;

create or replace function app.student_in_course(p_student uuid, p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_enrollments e
    where e.course_id = p_course and e.student_id = p_student and e.status = 'active')
$$;

create or replace function app.is_student_of(p_inst uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.institution_memberships m
    where m.institution_id = p_inst and m.user_id = p_student and m.role = 'estudiante' and m.status <> 'removed')
$$;

create or replace function app.can_submit(p_assignment uuid, p_inst uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments a
    where a.id = p_assignment and a.institution_id = p_inst and a.status = 'published' and app.is_enrolled(a.course_id))
$$;

create or replace function app.is_graded(p_assignment uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.grades g where g.assignment_id = p_assignment and g.student_id = p_student)
$$;

create or replace function app.has_wellbeing_file(p_inst uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.wellbeing_requests r where r.institution_id = p_inst and r.student_id = p_student)
      or exists (select 1 from public.wellbeing_cases c where c.institution_id = p_inst and c.student_id = p_student)
$$;

create or replace function app.in_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_participants p
    join public.conversations c on c.id = p.conversation_id
    where p.conversation_id = p_conversation and p.user_id = (select auth.uid()) and app.is_member(c.institution_id))
$$;

-- ¿Puede quien consulta ver el nombre y contacto de p_target?
create or replace function app.can_view_profile(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    exists (
      select 1 from public.institution_memberships t
      where t.user_id = p_target and (
        app.has_role(t.institution_id, 'admin', 'directivo', 'bienestar')
        or (t.status = 'active' and t.role in ('admin', 'directivo', 'docente', 'bienestar') and app.is_member(t.institution_id))
      ))
    or app.teaches_student(p_target)
    or app.is_guardian_of(p_target)
    or exists (   -- docente → apoderados de sus estudiantes
      select 1 from public.guardian_student_links l
      where l.guardian_id = p_target and app.teaches_student(l.student_id))
    or exists (   -- estudiante → sus apoderados
      select 1 from public.guardian_student_links l
      where l.guardian_id = p_target and l.student_id = (select auth.uid()) and app.is_member(l.institution_id))
$$;

create or replace function app.admin_of_user(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.institution_memberships t
    where t.user_id = p_target and app.has_role(t.institution_id, 'admin'))
$$;

create or replace function app.safe_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- Un administrador no puede cambiar su propio rol/estado (evita quedar sin administración) ni mover pertenencias de colegio.
create or replace function app.guard_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.institution_id <> old.institution_id or new.user_id <> old.user_id then
    raise exception 'La pertenencia no puede cambiar de institución ni de usuario';
  end if;
  if (select auth.uid()) is not null and old.user_id = (select auth.uid())
     and (new.role <> old.role or new.status <> old.status) then
    raise exception 'No puedes modificar tu propio rol o estado';
  end if;
  return new;
end $$;
create trigger memberships_guard before update on public.institution_memberships
  for each row execute function app.guard_membership();

grant usage on schema app to authenticated, service_role;
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;

-- ── Privilegios base ────────────────────────────────────────────────────────
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public revoke all on tables from anon;

-- Columnas editables por clientes (el resto solo cambia vía service role o funciones).
revoke update on public.institutions, public.profiles from authenticated;
grant update (name, rbd, dependency, commune, region) on public.institutions to authenticated;
grant update (full_name, phone, birth_date) on public.profiles to authenticated;
revoke insert, delete on public.institutions, public.profiles, public.institution_settings from authenticated;
revoke update, delete on public.audit_logs, public.ai_interactions from authenticated;
revoke insert, update, delete on public.ai_usage, public.conversations from authenticated;
revoke insert, delete on public.conversation_participants from authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ── Núcleo ──────────────────────────────────────────────────────────────────
create policy institutions_select on public.institutions for select to authenticated
  using (app.is_member(id));
create policy institutions_update on public.institutions for update to authenticated
  using (app.has_role(id, 'admin')) with check (app.has_role(id, 'admin'));

create policy settings_select on public.institution_settings for select to authenticated
  using (app.is_member(institution_id));
create policy settings_update on public.institution_settings for update to authenticated
  using (app.has_role(institution_id, 'admin')) with check (app.has_role(institution_id, 'admin'));

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.can_view_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or app.admin_of_user(id))
  with check (id = (select auth.uid()) or app.admin_of_user(id));

create policy memberships_select on public.institution_memberships for select to authenticated
  using (user_id = (select auth.uid()) or (app.is_member(institution_id) and app.can_view_profile(user_id)));
create policy memberships_insert on public.institution_memberships for insert to authenticated
  with check (app.has_role(institution_id, 'admin'));
create policy memberships_update on public.institution_memberships for update to authenticated
  using (app.has_role(institution_id, 'admin')) with check (app.has_role(institution_id, 'admin'));

create policy invitations_admin on public.invitations for all to authenticated
  using (app.has_role(institution_id, 'admin')) with check (app.has_role(institution_id, 'admin'));

create policy audit_select on public.audit_logs for select to authenticated
  using (app.has_role(institution_id, 'admin'));
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (actor_id = (select auth.uid()) and app.is_member(institution_id));

create policy deletion_requests_admin on public.deletion_requests for all to authenticated
  using (app.has_role(institution_id, 'admin')) with check (app.has_role(institution_id, 'admin'));

-- ── Estructura académica: la lee toda la comunidad del colegio, la escribe administración ──
do $$
declare t text;
begin
  foreach t in array array['academic_periods', 'grade_levels', 'courses', 'subjects', 'teacher_assignments'] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.is_member(institution_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.has_role(institution_id, ''admin''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.has_role(institution_id, ''admin'')) with check (app.has_role(institution_id, ''admin''))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.has_role(institution_id, ''admin''))', t || '_delete', t);
  end loop;
end $$;

create policy enrollments_select on public.course_enrollments for select to authenticated
  using (app.has_role(institution_id, 'admin', 'directivo', 'bienestar') or student_id = (select auth.uid())
         or app.teaches_course(course_id) or app.is_guardian_of(student_id));
create policy enrollments_insert on public.course_enrollments for insert to authenticated
  with check (app.has_role(institution_id, 'admin') and app.course_inst(course_id) = institution_id
              and app.is_student_of(institution_id, student_id));
create policy enrollments_update on public.course_enrollments for update to authenticated
  using (app.has_role(institution_id, 'admin')) with check (app.has_role(institution_id, 'admin'));

create policy guardian_links_select on public.guardian_student_links for select to authenticated
  using (app.has_role(institution_id, 'admin', 'bienestar') or guardian_id = (select auth.uid())
         or student_id = (select auth.uid()) or app.teaches_student(student_id));
create policy guardian_links_insert on public.guardian_student_links for insert to authenticated
  with check (app.has_role(institution_id, 'admin') and app.is_student_of(institution_id, student_id));
create policy guardian_links_delete on public.guardian_student_links for delete to authenticated
  using (app.has_role(institution_id, 'admin'));

-- ── Tareas, entregas, notas, asistencia ─────────────────────────────────────
create policy assignments_select on public.assignments for select to authenticated
  using (app.has_role(institution_id, 'admin', 'directivo') or app.teaches_course(course_id)
         or (status <> 'draft' and (app.is_enrolled(course_id) or app.guardian_in_course(course_id))));
create policy assignments_insert on public.assignments for insert to authenticated
  with check (teacher_id = (select auth.uid()) and app.teaches(course_id, subject_id)
              and app.course_inst(course_id) = institution_id);
create policy assignments_update on public.assignments for update to authenticated
  using (app.teaches(course_id, subject_id))
  with check (app.teaches(course_id, subject_id) and app.course_inst(course_id) = institution_id);
create policy assignments_delete on public.assignments for delete to authenticated
  using (app.teaches(course_id, subject_id));

create policy submissions_select on public.assignment_submissions for select to authenticated
  using (student_id = (select auth.uid()) or app.is_guardian_of(student_id)
         or app.has_role(institution_id, 'admin') or app.teaches_assignment(assignment_id));
create policy submissions_insert on public.assignment_submissions for insert to authenticated
  with check (student_id = (select auth.uid()) and app.can_submit(assignment_id, institution_id));
create policy submissions_update on public.assignment_submissions for update to authenticated
  using (student_id = (select auth.uid()) and not app.is_graded(assignment_id, student_id))
  with check (student_id = (select auth.uid()) and app.can_submit(assignment_id, institution_id));

create policy grades_select on public.grades for select to authenticated
  using (student_id = (select auth.uid()) or app.is_guardian_of(student_id)
         or app.has_role(institution_id, 'admin', 'directivo') or app.teaches(course_id, subject_id)
         or (app.has_role(institution_id, 'bienestar') and app.has_wellbeing_file(institution_id, student_id)));
create policy grades_insert on public.grades for insert to authenticated
  with check (graded_by = (select auth.uid()) and app.teaches(course_id, subject_id)
              and app.course_inst(course_id) = institution_id and app.student_in_course(student_id, course_id));
create policy grades_update on public.grades for update to authenticated
  using (app.teaches(course_id, subject_id))
  with check (graded_by = (select auth.uid()) and app.teaches(course_id, subject_id)
              and app.course_inst(course_id) = institution_id and app.student_in_course(student_id, course_id));
create policy grades_delete on public.grades for delete to authenticated
  using (app.teaches(course_id, subject_id));

create policy attendance_select on public.attendance_records for select to authenticated
  using (student_id = (select auth.uid()) or app.is_guardian_of(student_id)
         or app.has_role(institution_id, 'admin', 'directivo') or app.teaches_course(course_id)
         or (app.has_role(institution_id, 'bienestar') and app.has_wellbeing_file(institution_id, student_id)));
create policy attendance_insert on public.attendance_records for insert to authenticated
  with check (recorded_by = (select auth.uid()) and app.teaches_course(course_id)
              and app.course_inst(course_id) = institution_id and app.student_in_course(student_id, course_id));
create policy attendance_update on public.attendance_records for update to authenticated
  using (app.teaches_course(course_id))
  with check (recorded_by = (select auth.uid()) and app.teaches_course(course_id)
              and app.course_inst(course_id) = institution_id and app.student_in_course(student_id, course_id));

-- ── Comunicación ────────────────────────────────────────────────────────────
create policy announcements_select on public.announcements for select to authenticated
  using (app.is_member(institution_id) and (
    author_id = (select auth.uid()) or app.has_role(institution_id, 'admin', 'directivo')
    or (app.my_role(institution_id) = any (audience::text[])
        and (course_id is null or app.teaches_course(course_id) or app.is_enrolled(course_id) or app.guardian_in_course(course_id)))));
create policy announcements_insert on public.announcements for insert to authenticated
  with check (author_id = (select auth.uid()) and (
    app.has_role(institution_id, 'admin', 'directivo')
    or (course_id is not null and app.teaches_course(course_id) and app.course_inst(course_id) = institution_id)));
create policy announcements_delete on public.announcements for delete to authenticated
  using (author_id = (select auth.uid()) or app.has_role(institution_id, 'admin'));

create policy conversations_select on public.conversations for select to authenticated
  using (app.in_conversation(id));
create policy participants_select on public.conversation_participants for select to authenticated
  using (app.in_conversation(conversation_id));
create policy participants_update on public.conversation_participants for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy messages_select on public.messages for select to authenticated
  using (app.in_conversation(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and app.in_conversation(conversation_id)
              and institution_id = (select c.institution_id from public.conversations c where c.id = conversation_id));

create policy resources_select on public.resources for select to authenticated
  using (app.is_member(institution_id) and (
    uploaded_by = (select auth.uid()) or app.has_role(institution_id, 'admin', 'directivo')
    or (app.my_role(institution_id) = any (audience::text[])
        and (course_id is null or app.teaches_course(course_id) or app.is_enrolled(course_id) or app.guardian_in_course(course_id)))));
create policy resources_insert on public.resources for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and (
    app.has_role(institution_id, 'admin', 'directivo')
    or (course_id is not null and app.teaches_course(course_id) and app.course_inst(course_id) = institution_id)));
create policy resources_delete on public.resources for delete to authenticated
  using (uploaded_by = (select auth.uid()) or app.has_role(institution_id, 'admin'));

create policy strategies_select on public.improvement_strategies for select to authenticated
  using (app.has_role(institution_id, 'directivo', 'admin'));
create policy strategies_insert on public.improvement_strategies for insert to authenticated
  with check (created_by = (select auth.uid()) and app.has_role(institution_id, 'directivo'));
create policy strategies_update on public.improvement_strategies for update to authenticated
  using (app.has_role(institution_id, 'directivo')) with check (app.has_role(institution_id, 'directivo'));
create policy strategies_delete on public.improvement_strategies for delete to authenticated
  using (app.has_role(institution_id, 'directivo'));

-- ── Bienestar: solo el equipo de bienestar; quien solicita ve únicamente su propia solicitud ──
create policy wellbeing_requests_select on public.wellbeing_requests for select to authenticated
  using (app.has_role(institution_id, 'bienestar') or (requested_by = (select auth.uid()) and app.is_member(institution_id)));
create policy wellbeing_requests_insert on public.wellbeing_requests for insert to authenticated
  with check (
    requested_by = (select auth.uid()) and status = 'pending' and priority is null and assigned_to is null
    and app.is_student_of(institution_id, student_id)
    and (
      (source = 'estudiante' and student_id = (select auth.uid()) and app.has_role(institution_id, 'estudiante'))
      or (source = 'apoderado' and app.has_role(institution_id, 'apoderado') and app.is_guardian_of(student_id))
      or (source = 'docente' and app.has_role(institution_id, 'docente') and app.teaches_student(student_id))
      or (source = 'bienestar' and app.has_role(institution_id, 'bienestar'))
    ));
create policy wellbeing_requests_update on public.wellbeing_requests for update to authenticated
  using (app.has_role(institution_id, 'bienestar')) with check (app.has_role(institution_id, 'bienestar'));

do $$
declare t text;
begin
  foreach t in array array['wellbeing_cases', 'wellbeing_interventions', 'assessment_templates', 'assessment_responses'] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.has_role(institution_id, ''bienestar''))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.has_role(institution_id, ''bienestar''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.has_role(institution_id, ''bienestar'')) with check (app.has_role(institution_id, ''bienestar''))', t || '_update', t);
  end loop;
end $$;
revoke delete on public.wellbeing_requests, public.wellbeing_cases, public.wellbeing_interventions,
  public.assessment_templates, public.assessment_responses from authenticated;

-- ── IA ──────────────────────────────────────────────────────────────────────
create policy ai_interactions_select on public.ai_interactions for select to authenticated
  using (user_id = (select auth.uid()));
create policy ai_interactions_insert on public.ai_interactions for insert to authenticated
  with check (user_id = (select auth.uid()) and app.is_member(institution_id));
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()) or app.has_role(institution_id, 'admin'));
