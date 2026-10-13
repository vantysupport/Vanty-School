-- 0008_direction.sql — Atribuciones del equipo directivo y canal de reclamos y denuncias.

-- ── El equipo directivo también organiza la estructura académica ─────────────
-- Puede crear grados, cursos y asignaturas, asignar docentes e invitar docentes.
-- Las matrículas, los demás roles y la gestión de cuentas siguen siendo de administración.
do $$
declare t text;
begin
  foreach t in array array['academic_periods', 'grade_levels', 'courses', 'subjects', 'teacher_assignments'] loop
    execute format('drop policy %I on public.%I', t || '_insert', t);
    execute format('drop policy %I on public.%I', t || '_update', t);
    execute format('drop policy %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.has_role(institution_id, ''admin'', ''directivo''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.has_role(institution_id, ''admin'', ''directivo'')) with check (app.has_role(institution_id, ''admin'', ''directivo''))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.has_role(institution_id, ''admin'', ''directivo''))', t || '_delete', t);
  end loop;
end $$;

create policy invitations_directivo on public.invitations for all to authenticated
  using (app.has_role(institution_id, 'directivo') and role = 'docente')
  with check (app.has_role(institution_id, 'directivo') and role = 'docente');

-- ── Reclamos, denuncias y sugerencias ────────────────────────────────────────
-- Cualquier integrante de la comunidad puede presentar uno. Lo recibe solo el equipo directivo:
-- la administración no los ve (un reclamo puede referirse a ella) y quien lo presenta ve solo los suyos.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('reclamo', 'denuncia', 'sugerencia')),
  category text not null default 'otro'
    check (category in ('convivencia', 'academico', 'trato', 'infraestructura', 'administrativo', 'otro')),
  subject text not null check (char_length(subject) between 3 and 160),
  description text not null check (char_length(description) between 10 and 6000),
  involved text check (char_length(involved) <= 500),          -- personas o lugar involucrados, en palabras de quien reporta
  student_id uuid references public.profiles(id) on delete restrict,   -- estudiante afectado, si corresponde
  status text not null default 'received' check (status in ('received', 'in_review', 'resolved', 'dismissed')),
  -- La gravedad la define siempre una persona del equipo directivo.
  severity text check (severity in ('baja', 'media', 'alta', 'grave')),
  assigned_to uuid references public.profiles(id),
  resolution text check (char_length(resolution) <= 6000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_inst_idx on public.reports (institution_id, status, created_at desc);
create index reports_reporter_idx on public.reports (reporter_id);
create trigger reports_updated before update on public.reports for each row execute function app.set_updated_at();
create trigger reports_member before insert or update on public.reports
  for each row execute function app.check_member('student_id', 'assigned_to');

-- Bitácora de gestión de cada caso. Una nota puede marcarse como visible para quien reportó.
create table public.report_notes (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 2 and 4000),
  visible_to_reporter boolean not null default false,
  created_at timestamptz not null default now()
);
create index report_notes_report_idx on public.report_notes (report_id, created_at);
create trigger report_notes_same_inst before insert or update on public.report_notes
  for each row execute function app.check_same_institution('report_id', 'reports');

alter table public.reports enable row level security;
alter table public.report_notes enable row level security;
revoke all on public.reports, public.report_notes from anon, authenticated;
grant select, insert, update on public.reports to authenticated;
grant select, insert on public.report_notes to authenticated;

create or replace function app.is_reporter(p_report uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reports r where r.id = p_report and r.reporter_id = (select auth.uid()))
$$;
revoke execute on function app.is_reporter(uuid) from public, anon;
grant execute on function app.is_reporter(uuid) to authenticated, service_role;

create policy reports_select on public.reports for select to authenticated
  using (app.is_member(institution_id) and (app.has_role(institution_id, 'directivo') or reporter_id = (select auth.uid())));
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and app.is_member(institution_id)
              and status = 'received' and severity is null and assigned_to is null and resolution is null and resolved_at is null
              and (student_id is null or student_id = (select auth.uid()) or app.is_guardian_of(student_id)
                   or app.teaches_student(student_id) or app.has_role(institution_id, 'bienestar', 'directivo')));
create policy reports_update on public.reports for update to authenticated
  using (app.has_role(institution_id, 'directivo')) with check (app.has_role(institution_id, 'directivo'));

create policy report_notes_select on public.report_notes for select to authenticated
  using (app.is_member(institution_id) and (app.has_role(institution_id, 'directivo') or (visible_to_reporter and app.is_reporter(report_id))));
create policy report_notes_insert on public.report_notes for insert to authenticated
  with check (author_id = (select auth.uid()) and app.has_role(institution_id, 'directivo'));

-- Datos de demostración (solo si existe el colegio demo; todo ficticio).
do $$
declare v_inst uuid; v_dir uuid; v_ap uuid; v_est uuid; v_doc uuid; v_r uuid;
begin
  select id into v_inst from public.institutions where name = 'Colegio Futuro Andino' and is_demo;
  if v_inst is null or exists (select 1 from public.reports where institution_id = v_inst) then return; end if;
  select id into v_dir from public.profiles where email = 'direccion@futuroandino.example';
  select id into v_ap from public.profiles where email = 'ap02@futuroandino.example';
  select id into v_est from public.profiles where email = 'est08@futuroandino.example';
  select id into v_doc from public.profiles where email = 'dsepulveda@futuroandino.example';

  insert into public.reports (institution_id, reporter_id, kind, category, subject, description, involved, student_id, created_at)
    values (v_inst, v_ap, 'reclamo', 'infraestructura', 'Baños del segundo piso sin jabón ni papel',
            'Mi hija me comenta que hace dos semanas los baños del segundo piso no tienen jabón ni papel higiénico. Solicito que se revise el abastecimiento. (Reclamo ficticio de demostración.)',
            'Baños del segundo piso', null, now() - interval '2 days');
  insert into public.reports (institution_id, reporter_id, kind, category, subject, description, involved, created_at, status, severity, assigned_to)
    values (v_inst, v_est, 'denuncia', 'convivencia', 'Burlas reiteradas en el recreo',
            'Un grupo de compañeros se burla de un estudiante de mi curso casi todos los recreos. Él ya no quiere salir al patio. Prefiero no dar mi nombre a los involucrados. (Denuncia ficticia de demostración.)',
            'Patio central, recreo de las 10:00', now() - interval '4 days', 'in_review', 'alta', v_dir)
    returning id into v_r;
  insert into public.report_notes (institution_id, report_id, author_id, body, visible_to_reporter, created_at) values
    (v_inst, v_r, v_dir, 'Se activa el protocolo de convivencia escolar. Se solicita a inspectoría observar los recreos durante esta semana. (Nota ficticia.)', false, now() - interval '3 days'),
    (v_inst, v_r, v_dir, 'Recibimos tu denuncia y ya estamos tomando medidas. Tu identidad se mantiene en reserva. Gracias por avisar.', true, now() - interval '3 days');
  insert into public.reports (institution_id, reporter_id, kind, category, subject, description, created_at, status, severity, assigned_to, resolution, resolved_at)
    values (v_inst, v_doc, 'sugerencia', 'academico', 'Sala con proyector para Historia',
            'Sugiero habilitar una sala con proyector para las clases de Historia de 1.º medio, al menos una vez por semana. (Sugerencia ficticia de demostración.)',
            now() - interval '12 days', 'resolved', 'baja', v_dir,
            'Se asigna la sala de recursos los jueves en el tercer bloque a partir de la próxima semana.', now() - interval '8 days');
end $$;
