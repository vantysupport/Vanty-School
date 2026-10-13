-- ── RLS de personas a escala de colegio ───────────────────────────────────────
-- Las políticas de lectura de membresías, perfiles y fichas preguntaban fila por fila «¿puedo ver a esta persona?»
-- (app.can_view_profile). Con ~2.000 personas cada consulta tardaba entre 0,4 y 2 s. Igual que en 0031, las reglas
-- son exactamente las mismas; cambia la forma: «a quién puedo ver» se resuelve una vez por consulta, como conjunto.

-- Personas cuyo perfil puedo ver. Mismas seis reglas de app.can_view_profile, una por tramo:
create or replace function app.visible_profiles() returns setof uuid
language sql stable security definer set search_path = '' as $$
  -- 1. Todas las personas de los colegios donde soy administración, dirección o bienestar.
  select t.user_id from public.institution_memberships t
  where t.institution_id in (select app.my_insts('admin', 'directivo', 'bienestar'))
  union
  -- 2. El equipo activo (administración, dirección, docentes, bienestar) de mis colegios.
  select t.user_id from public.institution_memberships t
  where t.status = 'active' and t.role in ('admin', 'directivo', 'docente', 'bienestar') and t.institution_id in (select app.my_insts())
  union
  -- 3. Estudiantes con matrícula activa en un curso que imparto.
  select e.student_id from public.course_enrollments e
  where e.status = 'active' and e.course_id in (select t.course_id from app.my_teaching() t)
  union
  -- 4. Mis pupilos.
  select app.my_pupils()
  union
  -- 5. Apoderados de los estudiantes a quienes hago clases.
  select l.guardian_id from public.guardian_student_links l
  where l.student_id in (
    select e.student_id from public.course_enrollments e
    where e.status = 'active' and e.course_id in (select t.course_id from app.my_teaching() t))
  union
  -- 6. Mis propios apoderados.
  select l.guardian_id from public.guardian_student_links l
  where l.student_id = (select auth.uid()) and l.institution_id in (select app.my_insts())
$$;

revoke execute on function app.visible_profiles() from public, anon;
grant execute on function app.visible_profiles() to authenticated, service_role;

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid()) or id in (select app.visible_profiles()));

drop policy memberships_select on public.institution_memberships;
create policy memberships_select on public.institution_memberships for select to authenticated using (
  user_id = (select auth.uid())
  or (institution_id in (select app.my_insts()) and user_id in (select app.visible_profiles())));

drop policy person_records_select on public.person_records;
create policy person_records_select on public.person_records for select to authenticated using (
  institution_id in (select app.my_insts()) and (
    user_id = (select auth.uid())
    or institution_id in (select app.my_insts('admin', 'directivo'))));
