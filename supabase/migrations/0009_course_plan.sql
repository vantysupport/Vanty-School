-- 0009_course_plan.sql — Plan de asignaturas por curso y capacidad de aula.
-- No todos los cursos llevan las mismas asignaturas (varían por grado y, en electivos, por sección).
-- course_subjects es el plan: qué asignaturas tiene cada curso, tenga o no docente asignado todavía.

create table public.course_subjects (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, subject_id)
);
create index course_subjects_inst_idx on public.course_subjects (institution_id);
create trigger course_subjects_same_inst before insert or update on public.course_subjects
  for each row execute function app.check_same_institution('course_id', 'courses', 'subject_id', 'subjects');

alter table public.course_subjects enable row level security;
revoke all on public.course_subjects from anon, authenticated;
grant select, insert, delete on public.course_subjects to authenticated;

create policy course_subjects_select on public.course_subjects for select to authenticated
  using (app.is_member(institution_id));
create policy course_subjects_insert on public.course_subjects for insert to authenticated
  with check (app.has_role(institution_id, 'admin', 'directivo'));
create policy course_subjects_delete on public.course_subjects for delete to authenticated
  using (app.has_role(institution_id, 'admin', 'directivo'));

-- Los cursos existentes parten con las asignaturas que ya tienen docente.
insert into public.course_subjects (institution_id, course_id, subject_id)
  select institution_id, course_id, subject_id from public.teacher_assignments
  on conflict do nothing;

-- Asignar un docente a una asignatura la incorpora al plan del curso.
create or replace function app.sync_course_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.course_subjects (institution_id, course_id, subject_id)
    values (new.institution_id, new.course_id, new.subject_id) on conflict do nothing;
  return new;
end $$;
create trigger teacher_assignments_plan after insert on public.teacher_assignments
  for each row execute function app.sync_course_plan();

-- Capacidad de cada aula (en Chile el máximo habitual es de 45 estudiantes por curso).
alter table public.courses add column capacity integer not null default 45 check (capacity between 1 and 60);
