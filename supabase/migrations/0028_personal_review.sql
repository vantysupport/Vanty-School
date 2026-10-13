-- ── Repasemos · «Crear con ARIA»: misiones personales del estudiante ────────
-- El estudiante escribe el tema que quiere repasar y ARIA arma una misión solo para él: un «Recuerda» breve
-- y preguntas de alternativas. No lleva videos (nadie los revisó antes) ni nota.
-- La ven el propio estudiante, sus apoderados, el docente de esa asignatura y la dirección; el docente puede eliminarla.

alter table public.review_missions
  add column student_id uuid references public.profiles(id) on delete cascade,
  alter column teacher_id drop not null,
  add constraint review_missions_author check ((student_id is null) <> (teacher_id is null));
create index review_missions_student_idx on public.review_missions (student_id, created_at desc) where student_id is not null;

-- Nuevo tipo de paso: una nota breve para leer antes de practicar.
alter table public.review_items
  add column body text check (body is null or char_length(body) <= 1200),
  drop constraint review_items_kind_check,
  drop constraint review_items_check,
  add constraint review_items_kind_check check (kind in ('video', 'question', 'note')),
  add constraint review_items_shape check (
    (kind = 'video' and youtube_id is not null and options is null and body is null)
    or (kind = 'question' and youtube_id is null and options is not null and body is null)
    or (kind = 'note' and youtube_id is null and options is null and body is not null));

alter table public.ai_interactions
  drop constraint ai_interactions_mode_check,
  add constraint ai_interactions_mode_check check (mode in ('pedagogica', 'bienestar', 'familias', 'gestion', 'repaso'));

-- Las misiones del curso las ven sus estudiantes; las personales, solo su dueño y los adultos a cargo.
create or replace function app.sees_mission(p_mission uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.review_missions m where m.id = p_mission and (
      app.teaches(m.course_id, m.subject_id) or app.has_role(m.institution_id, 'directivo')
      or (m.student_id is null and m.status = 'published' and (app.student_in_course((select auth.uid()), m.course_id) or app.guardian_in_course(m.course_id)))
      or (m.student_id is not null and (m.student_id = (select auth.uid()) or app.is_guardian_of(m.student_id)))))
$$;

-- El docente solo crea misiones del curso; las personales nacen únicamente con review_create_personal.
drop policy review_missions_insert on public.review_missions;
create policy review_missions_insert on public.review_missions for insert to authenticated
  with check (teacher_id = (select auth.uid()) and student_id is null and app.teaches(course_id, subject_id) and app.course_inst(course_id) = institution_id);
drop policy review_missions_update on public.review_missions;
create policy review_missions_update on public.review_missions for update to authenticated
  using (student_id is null and app.teaches(course_id, subject_id))
  with check (student_id is null and app.teaches(course_id, subject_id) and app.course_inst(course_id) = institution_id);
drop policy review_missions_delete on public.review_missions;
create policy review_missions_delete on public.review_missions for delete to authenticated
  using (app.teaches(course_id, subject_id) or (student_id = (select auth.uid()) and app.has_role(institution_id, 'estudiante')));

-- Crea la misión personal completa en una sola operación. p_items: [{kind:'note', prompt, body} | {kind:'question', prompt, options[], correct, explanation}]
create or replace function public.review_create_personal(p_course uuid, p_subject uuid, p_title text, p_description text, p_topic text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_inst uuid;
  v_mission uuid;
  v_item uuid;
  v_el jsonb;
  v_pos integer := 0;
  v_questions integer := 0;
begin
  select c.institution_id into v_inst from public.courses c where c.id = p_course;
  if v_uid is null or v_inst is null or not app.has_role(v_inst, 'estudiante') or not app.student_in_course(v_uid, p_course)
     or not exists (select 1 from public.course_subjects cs where cs.course_id = p_course and cs.subject_id = p_subject) then
    raise exception 'not_authorized';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 2 and 10 then raise exception 'invalid_items'; end if;
  -- Tope para que la lista no crezca sin control: el estudiante borra las que ya no usa.
  if (select count(*) from public.review_missions m where m.student_id = v_uid) >= 30 then raise exception 'too_many'; end if;

  insert into public.review_missions (institution_id, course_id, subject_id, student_id, title, description, topic, status)
    values (v_inst, p_course, p_subject, v_uid, left(btrim(p_title), 120), left(coalesce(btrim(p_description), ''), 600), nullif(left(btrim(coalesce(p_topic, '')), 80), ''), 'published')
    returning id into v_mission;

  for v_el in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    if v_el->>'kind' = 'note' then
      insert into public.review_items (institution_id, mission_id, position, kind, prompt, body)
        values (v_inst, v_mission, v_pos, 'note', left(v_el->>'prompt', 500), left(v_el->>'body', 1200));
    elsif v_el->>'kind' = 'question' then
      if jsonb_typeof(v_el->'options') <> 'array' or (v_el->>'correct')::integer not between 0 and jsonb_array_length(v_el->'options') - 1 then raise exception 'invalid_items'; end if;
      insert into public.review_items (institution_id, mission_id, position, kind, prompt, options)
        values (v_inst, v_mission, v_pos, 'question', left(v_el->>'prompt', 500), v_el->'options') returning id into v_item;
      insert into public.review_item_keys (item_id, institution_id, correct_index, explanation)
        values (v_item, v_inst, (v_el->>'correct')::integer, left(coalesce(v_el->>'explanation', ''), 600));
      v_questions := v_questions + 1;
    else
      raise exception 'invalid_items';
    end if;
  end loop;
  if v_questions = 0 then raise exception 'invalid_items'; end if;
  return v_mission;
end $$;
revoke execute on function public.review_create_personal(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.review_create_personal(uuid, uuid, text, text, text, jsonb) to authenticated;

-- Responder: las misiones personales solo las resuelve su dueño; una nota se marca como leída igual que un video.
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
     or not app.student_in_course(v_uid, v_mission.course_id)
     or (v_mission.student_id is not null and v_mission.student_id <> v_uid) then raise exception 'not_authorized'; end if;

  select * into v_prev from public.review_progress where item_id = p_item and student_id = v_uid;

  if v_item.kind in ('video', 'note') then
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
  return jsonb_build_object('done', v_correct or coalesce(v_prev.done, false), 'correct', v_correct,
    'explanation', case when v_correct then v_key.explanation else null end);
end $$;
