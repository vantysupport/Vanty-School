-- Los repasos creados con ARIA pueden llevar un video de YouTube sobre el tema (lo busca el servidor con filtro estricto).
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
    elsif v_el->>'kind' = 'video' then
      insert into public.review_items (institution_id, mission_id, position, kind, prompt, youtube_id)
        values (v_inst, v_mission, v_pos, 'video', left(v_el->>'prompt', 500), v_el->>'youtube_id');
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
