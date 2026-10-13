-- 0002_academic.sql — Estructura académica, tareas, calificaciones, asistencia y comunicación.
-- Los registros académicos referencian a personas con ON DELETE RESTRICT: retirar a un usuario
-- nunca borra notas, entregas ni asistencia.

create table public.academic_periods (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  year integer not null check (year between 2000 and 2100),
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (institution_id, year, name)
);
create unique index academic_periods_one_current on public.academic_periods (institution_id) where is_current;

create table public.grade_levels (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null,                         -- "6.º básico", "1.º medio"
  stage text not null check (stage in ('parvularia', 'basica', 'media')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (institution_id, name)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  grade_level_id uuid not null references public.grade_levels(id) on delete restrict,
  period_id uuid not null references public.academic_periods(id) on delete restrict,
  section text not null check (char_length(section) between 1 and 10),   -- "A"
  name text not null,                         -- "6.º básico A"
  head_teacher_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, period_id, grade_level_id, section)
);
create index courses_inst_idx on public.courses (institution_id);

alter table public.invitations
  add constraint invitations_course_fk foreign key (course_id) references public.courses(id) on delete set null;

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  code text,
  created_at timestamptz not null default now(),
  unique (institution_id, name)
);

create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'withdrawn')),
  enrolled_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (course_id, student_id)
);
create index enrollments_student_idx on public.course_enrollments (student_id, status);
create index enrollments_inst_idx on public.course_enrollments (institution_id);

create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (course_id, subject_id)
);
create index teacher_assignments_teacher_idx on public.teacher_assignments (teacher_id);

create table public.guardian_student_links (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  guardian_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  relationship text not null default 'apoderado',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  check (guardian_id <> student_id),
  unique (institution_id, guardian_id, student_id)
);
create index guardian_links_student_idx on public.guardian_student_links (student_id);
create index guardian_links_guardian_idx on public.guardian_student_links (guardian_id);

-- ── Tareas, entregas y calificaciones ───────────────────────────────────────
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '',
  topic text,                                 -- contenido o unidad: alimenta el análisis agregado
  due_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  attachment_path text,
  attachment_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_course_idx on public.assignments (course_id, subject_id, due_at);
create index assignments_inst_idx on public.assignments (institution_id);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  content text not null default '',
  file_path text,
  file_name text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);
create index submissions_student_idx on public.assignment_submissions (student_id);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  assignment_id uuid references public.assignments(id) on delete restrict,
  score numeric(2,1) not null check (score between 1.0 and 7.0),   -- escala chilena
  feedback text not null default '',
  graded_by uuid not null references public.profiles(id) on delete restrict,
  graded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);
create index grades_student_idx on public.grades (student_id);
create index grades_course_idx on public.grades (course_id, subject_id);
create index grades_inst_idx on public.grades (institution_id);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  date date not null,
  status text not null check (status in ('present', 'absent', 'late', 'justified')),
  note text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, student_id, date)
);
create index attendance_student_idx on public.attendance_records (student_id, date);
create index attendance_inst_idx on public.attendance_records (institution_id, date);

-- ── Comunicación ────────────────────────────────────────────────────────────
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  course_id uuid references public.courses(id) on delete cascade,   -- null = todo el colegio
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 1 and 5000),
  audience public.member_role[] not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index announcements_inst_idx on public.announcements (institution_id, published_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 160),
  kind text not null default 'message' check (kind in ('message', 'meeting_request')),
  student_id uuid references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index conversations_inst_idx on public.conversations (institution_id, last_message_at desc);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ── Recursos y material ─────────────────────────────────────────────────────
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  kind text not null default 'material' check (kind in ('material', 'documento', 'institucional')),
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '',
  file_path text not null,
  file_name text not null,
  audience public.member_role[] not null default '{admin,directivo,docente,bienestar,apoderado,estudiante}',
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index resources_inst_idx on public.resources (institution_id, created_at desc);

-- ── Dirección: estrategias de mejora ────────────────────────────────────────
create table public.improvement_strategies (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  description text not null check (char_length(description) between 3 and 6000),
  subject_id uuid references public.subjects(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'discarded')),
  review_on date,
  origin text not null default 'manual' check (origin in ('manual', 'aria')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index strategies_inst_idx on public.improvement_strategies (institution_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['academic_periods', 'courses', 'assignments', 'assignment_submissions', 'grades',
                           'attendance_records', 'improvement_strategies'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.set_updated_at()', t || '_updated', t);
  end loop;
end $$;
