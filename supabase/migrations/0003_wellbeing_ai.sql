-- 0003_wellbeing_ai.sql — Bienestar escolar (datos sensibles) y registro de uso de IA.
-- Las tablas de bienestar están separadas de las académicas y tienen políticas propias (0004):
-- ni el administrador ni el directivo pueden leerlas.

create table public.wellbeing_requests (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  source text not null check (source in ('estudiante', 'apoderado', 'docente', 'bienestar')),
  category text not null default 'otro'
    check (category in ('academico', 'convivencia', 'emocional', 'familiar', 'otro')),
  description text not null check (char_length(description) between 5 and 4000),
  status text not null default 'pending' check (status in ('pending', 'in_review', 'in_follow_up', 'closed')),
  -- La prioridad la fija siempre una persona del equipo; ningún proceso automático la escribe.
  priority text check (priority in ('baja', 'media', 'alta', 'urgente')),
  priority_set_by uuid references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wellbeing_requests_inst_idx on public.wellbeing_requests (institution_id, status, created_at desc);
create index wellbeing_requests_student_idx on public.wellbeing_requests (student_id);

create table public.wellbeing_cases (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid references public.wellbeing_requests(id) on delete set null,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  responsible_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'follow_up', 'referred', 'closed')),
  summary text not null check (char_length(summary) between 5 and 4000),
  follow_up_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wellbeing_cases_inst_idx on public.wellbeing_cases (institution_id, status);
create index wellbeing_cases_student_idx on public.wellbeing_cases (student_id);

create table public.wellbeing_interventions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  case_id uuid not null references public.wellbeing_cases(id) on delete restrict,
  professional_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('entrevista', 'observacion', 'reunion_apoderado', 'coordinacion_docente', 'derivacion', 'seguimiento')),
  notes text not null check (char_length(notes) between 5 and 6000),
  occurred_on date not null default current_date,
  next_follow_up_on date,
  created_at timestamptz not null default now()
);
create index wellbeing_interventions_case_idx on public.wellbeing_interventions (case_id, occurred_on desc);

-- Instrumentos: los define el profesional. La plataforma no trae instrumentos clínicos ni baremos.
create table public.assessment_templates (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '',
  authorization_note text not null default '',   -- respaldo de autorización/licencia del instrumento
  -- [{ id, text, type: 'scale' | 'text', min?, max? }]
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  -- { type: 'none' | 'sum' | 'mean', note } — regla documentada, sin interpretación diagnóstica
  scoring_rule jsonb not null default '{"type":"none","note":""}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assessment_templates_inst_idx on public.assessment_templates (institution_id, status);

create table public.assessment_responses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  template_id uuid not null references public.assessment_templates(id) on delete restrict,
  case_id uuid references public.wellbeing_cases(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  administered_by uuid not null references public.profiles(id) on delete restrict,
  answers jsonb not null default '{}'::jsonb,
  computed_score numeric(8,2),                -- resultado de la regla documentada; null si la regla es 'none'
  professional_review text,                   -- la interpretación es siempre de la persona profesional
  recommendations text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  follow_up_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assessment_responses_case_idx on public.assessment_responses (case_id);
create index assessment_responses_inst_idx on public.assessment_responses (institution_id, created_at desc);

-- ── IA ──────────────────────────────────────────────────────────────────────
create table public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  mode text not null check (mode in ('pedagogica', 'bienestar', 'familias', 'gestion')),
  prompt text not null,
  response text,
  context_scope jsonb not null default '{}'::jsonb,   -- qué datos se entregaron al modelo (ids, no contenido)
  provider text,
  model text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  status text not null check (status in ('ok', 'error', 'blocked')),
  error_code text,
  created_at timestamptz not null default now()
);
create index ai_interactions_user_idx on public.ai_interactions (user_id, created_at desc);
create index ai_interactions_inst_idx on public.ai_interactions (institution_id, created_at desc);

create table public.ai_usage (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  day date not null default current_date,
  requests integer not null default 0,
  tokens integer not null default 0,
  primary key (institution_id, user_id, day)
);

do $$
declare t text;
begin
  foreach t in array array['wellbeing_requests', 'wellbeing_cases', 'assessment_templates', 'assessment_responses'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.set_updated_at()', t || '_updated', t);
  end loop;
end $$;
