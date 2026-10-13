-- 0015_person_records.sql — Ficha completa de cada persona e incidencias del estudiante.
-- person_records: datos personales que NO deben verse con solo poder ver el perfil (RUN, domicilio, contacto de
--   emergencia). Los lee y edita la administración; los lee dirección y la propia persona.
-- student_incidents: hoja de vida del estudiante (anotaciones positivas, negativas e informativas).
--   La leen administración, dirección y los docentes del estudiante. No se muestran a familias ni estudiantes.

create table public.person_records (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  national_id text check (char_length(national_id) <= 20),           -- RUN
  gender text check (gender in ('femenino', 'masculino', 'otro', 'no_informa')),
  nationality text check (char_length(nationality) <= 60),
  address text check (char_length(address) <= 200),
  commune text check (char_length(commune) <= 80),
  emergency_name text check (char_length(emergency_name) <= 160),
  emergency_phone text check (char_length(emergency_phone) <= 30),
  emergency_relation text check (char_length(emergency_relation) <= 40),
  admission_date date,                                               -- ingreso al colegio
  job_title text check (char_length(job_title) <= 120),              -- funcionarios: cargo o título profesional
  specialty text check (char_length(specialty) <= 120),              -- docentes: mención o especialidad
  notes text check (char_length(notes) <= 2000),                     -- observaciones administrativas
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (institution_id, user_id)
);
create trigger person_records_updated before update on public.person_records for each row execute function app.set_updated_at();

create table public.student_incidents (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  course_id uuid references public.courses(id) on delete set null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('positiva', 'negativa', 'informativa')),
  category text not null default 'otro' check (category in ('conducta', 'responsabilidad', 'convivencia', 'academico', 'otro')),
  description text not null check (char_length(description) between 3 and 2000),
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index student_incidents_idx on public.student_incidents (institution_id, student_id, occurred_on desc);
create trigger student_incidents_same_inst before insert or update on public.student_incidents
  for each row execute function app.check_same_institution('course_id', 'courses');

alter table public.person_records enable row level security;
alter table public.student_incidents enable row level security;
revoke all on public.person_records, public.student_incidents from anon, authenticated;
grant select, insert, update on public.person_records to authenticated;
grant select, insert, delete on public.student_incidents to authenticated;

create policy person_records_select on public.person_records for select to authenticated
  using (app.is_member(institution_id) and (user_id = (select auth.uid()) or app.has_role(institution_id, 'admin', 'directivo')));
create policy person_records_insert on public.person_records for insert to authenticated
  with check (app.has_role(institution_id, 'admin')
              and exists (select 1 from public.institution_memberships m where m.institution_id = person_records.institution_id and m.user_id = person_records.user_id));
create policy person_records_update on public.person_records for update to authenticated
  using (app.has_role(institution_id, 'admin')) with check (app.has_role(institution_id, 'admin'));

create policy student_incidents_select on public.student_incidents for select to authenticated
  using (app.is_member(institution_id) and (app.has_role(institution_id, 'admin', 'directivo') or app.teaches_student(student_id)));
create policy student_incidents_insert on public.student_incidents for insert to authenticated
  with check (recorded_by = (select auth.uid()) and app.is_student_of(institution_id, student_id)
              and (app.has_role(institution_id, 'admin', 'directivo') or app.teaches_student(student_id)));
create policy student_incidents_delete on public.student_incidents for delete to authenticated
  using (recorded_by = (select auth.uid()) or app.has_role(institution_id, 'admin'));

-- Datos de demostración (ficticios) solo para colegios marcados como demo.
insert into public.person_records (institution_id, user_id, national_id, gender, nationality, address, commune, emergency_name, emergency_phone, emergency_relation, admission_date, job_title, specialty)
select m.institution_id, m.user_id,
  '99.' || lpad((100 + row_number() over (order by m.created_at, m.user_id))::text, 3, '0') || '.' || lpad((row_number() over (order by m.user_id) * 37 % 1000)::text, 3, '0') || '-K',
  'no_informa', 'Chilena', 'Calle Ficticia ' || (100 + row_number() over (order by m.user_id) * 13) || ' (dato de demostración)', 'Ñuñoa',
  case when m.role = 'estudiante' then 'Contacto ficticio' end, case when m.role = 'estudiante' then '+56 9 0000 0000' end, case when m.role = 'estudiante' then 'Apoderado' end,
  date '2026-03-02',
  case m.role when 'docente' then 'Profesor(a) de Educación Media' when 'directivo' then 'Director(a)' when 'bienestar' then 'Psicólogo(a) escolar' when 'admin' then 'Encargado(a) de administración' end,
  case when m.role = 'docente' then 'Por completar' end
from public.institution_memberships m join public.institutions i on i.id = m.institution_id
where i.is_demo and m.status <> 'removed'
on conflict do nothing;

insert into public.student_incidents (institution_id, student_id, course_id, recorded_by, kind, category, description, occurred_on)
select e.institution_id, e.student_id, e.course_id, ta.teacher_id, x.kind, x.category, x.description || ' (Registro ficticio de demostración.)', current_date - x.days
from public.course_enrollments e
join public.institutions i on i.id = e.institution_id and i.is_demo
join lateral (select teacher_id from public.teacher_assignments t where t.course_id = e.course_id order by t.created_at limit 1) ta on true
join lateral (values
  ('positiva', 'academico', 'Participó activamente y ayudó a un compañero a resolver los ejercicios.', 12, 0),
  ('negativa', 'responsabilidad', 'No presentó la guía solicitada por segunda vez.', 6, 1),
  ('informativa', 'convivencia', 'Se conversó con el estudiante sobre el uso del celular en clases.', 3, 2)
) as x(kind, category, description, days, slot) on (abs(hashtext(e.student_id::text)) % 3) >= x.slot
where e.status = 'active';
