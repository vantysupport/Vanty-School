-- ── Repasemos: misiones para repasar lo visto en clases ──────────────────────
-- Cada misión la arma un docente para un curso y asignatura, con pasos de dos tipos: un video de YouTube
-- (se ve dentro de la plataforma) o una pregunta de alternativas. El estudiante avanza paso a paso.
-- La respuesta correcta vive en una tabla aparte que el estudiante no puede leer: solo la conoce al responder.

create table public.review_missions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 600),
  topic text check (topic is null or char_length(topic) <= 80),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index review_missions_course_idx on public.review_missions (course_id, subject_id, created_at desc);
create trigger review_missions_same_inst before insert or update on public.review_missions
  for each row execute function app.check_same_institution('course_id', 'courses', 'subject_id', 'subjects');

create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  mission_id uuid not null references public.review_missions(id) on delete cascade,
  position integer not null default 0,
  kind text not null check (kind in ('video', 'question')),
  prompt text not null check (char_length(prompt) between 2 and 500),     -- título del video o enunciado de la pregunta
  youtube_id text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  options jsonb check (options is null or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 5)),
  created_at timestamptz not null default now(),
  check ((kind = 'video' and youtube_id is not null and options is null) or (kind = 'question' and youtube_id is null and options is not null))
);
create index review_items_mission_idx on public.review_items (mission_id, position, created_at);
create trigger review_items_same_inst before insert or update on public.review_items
  for each row execute function app.check_same_institution('mission_id', 'review_missions');

-- Clave de cada pregunta: solo para quien arma la misión.
create table public.review_item_keys (
  item_id uuid primary key references public.review_items(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  correct_index integer not null check (correct_index between 0 and 4),
  explanation text not null default '' check (char_length(explanation) <= 600)
);

-- Avance de cada estudiante. Lo escribe únicamente la función review_answer.
create table public.review_progress (
  item_id uuid not null references public.review_items(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  mission_id uuid not null references public.review_missions(id) on delete cascade,
  done boolean not null default false,        -- video visto o pregunta respondida correctamente
  attempts integer not null default 0,        -- intentos en una pregunta
  first_try boolean not null default false,   -- acertó al primer intento
  completed_at timestamptz,
  primary key (item_id, student_id)
);
create index review_progress_student_idx on public.review_progress (student_id, mission_id);

alter table public.review_missions enable row level security;
alter table public.review_items enable row level security;
alter table public.review_item_keys enable row level security;
alter table public.review_progress enable row level security;
revoke all on public.review_missions, public.review_items, public.review_item_keys, public.review_progress from anon, authenticated;
grant select, insert, update, delete on public.review_missions, public.review_items, public.review_item_keys to authenticated;
grant select on public.review_progress to authenticated;

create or replace function app.owns_mission(p_mission uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.review_missions m where m.id = p_mission and app.teaches(m.course_id, m.subject_id))
$$;
-- La ven el docente del curso y asignatura, la dirección y, si está publicada, los estudiantes del curso y sus apoderados.
create or replace function app.sees_mission(p_mission uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.review_missions m where m.id = p_mission and (
      app.teaches(m.course_id, m.subject_id) or app.has_role(m.institution_id, 'directivo')
      or (m.status = 'published' and (app.student_in_course((select auth.uid()), m.course_id) or app.guardian_in_course(m.course_id)))))
$$;
revoke execute on function app.owns_mission(uuid), app.sees_mission(uuid) from public, anon;
grant execute on function app.owns_mission(uuid), app.sees_mission(uuid) to authenticated, service_role;

create policy review_missions_select on public.review_missions for select to authenticated using (app.sees_mission(id));
create policy review_missions_insert on public.review_missions for insert to authenticated
  with check (teacher_id = (select auth.uid()) and app.teaches(course_id, subject_id) and app.course_inst(course_id) = institution_id);
create policy review_missions_update on public.review_missions for update to authenticated
  using (app.teaches(course_id, subject_id)) with check (app.teaches(course_id, subject_id) and app.course_inst(course_id) = institution_id);
create policy review_missions_delete on public.review_missions for delete to authenticated using (app.teaches(course_id, subject_id));

create policy review_items_select on public.review_items for select to authenticated using (app.sees_mission(mission_id));
create policy review_items_write on public.review_items for all to authenticated using (app.owns_mission(mission_id)) with check (app.owns_mission(mission_id));

create policy review_item_keys_all on public.review_item_keys for all to authenticated
  using (exists (select 1 from public.review_items i where i.id = item_id and app.owns_mission(i.mission_id)))
  with check (exists (select 1 from public.review_items i where i.id = item_id and app.owns_mission(i.mission_id)));

create policy review_progress_select on public.review_progress for select to authenticated
  using (student_id = (select auth.uid()) or app.owns_mission(mission_id) or app.is_guardian_of(student_id) or app.has_role(institution_id, 'directivo'));

-- El estudiante marca un video como visto o responde una pregunta. Devuelve si acertó y, recién entonces, la explicación.
create or replace function public.review_answer(p_item uuid, p_choice integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.review_items%rowtype;
  v_mission public.review_missions%rowtype;
  v_key public.review_item_keys%rowtype;
  v_correct boolean;
  v_prev public.review_progress%rowtype;
begin
  if v_uid is null then raise exception 'not_authorized'; end if;
  select * into v_item from public.review_items where id = p_item;
  if not found then raise exception 'not_authorized'; end if;
  select * into v_mission from public.review_missions where id = v_item.mission_id;
  if v_mission.status <> 'published' or not app.has_role(v_mission.institution_id, 'estudiante')
     or not app.student_in_course(v_uid, v_mission.course_id) then raise exception 'not_authorized'; end if;

  select * into v_prev from public.review_progress where item_id = p_item and student_id = v_uid;

  if v_item.kind = 'video' then
    insert into public.review_progress (item_id, student_id, institution_id, mission_id, done, completed_at)
      values (p_item, v_uid, v_mission.institution_id, v_mission.id, true, now())
      on conflict (item_id, student_id) do update set done = true, completed_at = coalesce(public.review_progress.completed_at, now());
    return jsonb_build_object('done', true);
  end if;

  select * into v_key from public.review_item_keys where item_id = p_item;
  if not found or p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(v_item.options) then raise exception 'invalid_choice'; end if;
  v_correct := p_choice = v_key.correct_index;
  insert into public.review_progress (item_id, student_id, institution_id, mission_id, done, attempts, first_try, completed_at)
    values (p_item, v_uid, v_mission.institution_id, v_mission.id, v_correct, 1, v_correct, case when v_correct then now() end)
    on conflict (item_id, student_id) do update set
      attempts = public.review_progress.attempts + case when public.review_progress.done then 0 else 1 end,
      done = public.review_progress.done or v_correct,
      completed_at = coalesce(public.review_progress.completed_at, case when v_correct then now() end);
  -- La explicación y la alternativa correcta se entregan solo cuando acierta.
  return jsonb_build_object('done', v_correct or coalesce(v_prev.done, false), 'correct', v_correct,
    'explanation', case when v_correct then v_key.explanation else null end);
end $$;
revoke execute on function public.review_answer(uuid, integer) from public, anon;
grant execute on function public.review_answer(uuid, integer) to authenticated;
