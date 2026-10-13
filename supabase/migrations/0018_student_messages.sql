-- ── Mensajes del docente al estudiante, siempre con copia a sus apoderados ───
-- Un docente puede escribirle a un estudiante al que le hace clases. La conversación
-- nunca es privada entre un adulto y un menor: los apoderados vinculados entran como
-- participantes en el mismo acto, y si el estudiante no tiene apoderado no se crea.
create or replace function public.start_conversation(
  p_inst uuid, p_recipient uuid, p_student uuid, p_subject text, p_body text, p_kind text default 'message'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_me text := app.my_role(p_inst);
  v_other text;
  v_ok boolean := false;
  v_copy boolean := false;
  v_id uuid;
begin
  if v_uid is null or v_me is null then raise exception 'not_authorized'; end if;
  if p_kind not in ('message', 'meeting_request') then raise exception 'invalid_kind'; end if;
  select m.role::text into v_other from public.institution_memberships m
    where m.institution_id = p_inst and m.user_id = p_recipient and m.status = 'active';
  if v_other is null or p_recipient = v_uid then raise exception 'invalid_recipient'; end if;

  if v_me = 'apoderado' and app.is_guardian_of(p_student) then
    v_ok := (v_other = 'docente' and exists (
               select 1 from public.course_enrollments e
               join public.teacher_assignments ta on ta.course_id = e.course_id
               where e.student_id = p_student and e.status = 'active' and ta.teacher_id = p_recipient))
            or v_other = 'bienestar';
  elsif v_me = 'docente' and app.teaches_student(p_student) then
    if v_other = 'estudiante' and p_recipient = p_student then
      if not exists (
        select 1 from public.guardian_student_links l
        join public.institution_memberships m on m.user_id = l.guardian_id and m.institution_id = l.institution_id and m.status = 'active'
        where l.institution_id = p_inst and l.student_id = p_student) then
        raise exception 'no_guardian';
      end if;
      v_ok := true; v_copy := true;
    else
      v_ok := v_other = 'apoderado' and exists (
                select 1 from public.guardian_student_links l
                where l.institution_id = p_inst and l.student_id = p_student and l.guardian_id = p_recipient);
    end if;
  elsif v_me = 'bienestar' then
    v_ok := v_other = 'apoderado' and exists (
              select 1 from public.guardian_student_links l
              where l.institution_id = p_inst and l.student_id = p_student and l.guardian_id = p_recipient);
  end if;
  if not v_ok then raise exception 'not_authorized'; end if;

  insert into public.conversations (institution_id, subject, kind, student_id, created_by)
    values (p_inst, p_subject, p_kind, p_student, v_uid) returning id into v_id;
  insert into public.conversation_participants (conversation_id, user_id, last_read_at)
    values (v_id, v_uid, now()), (v_id, p_recipient, null);
  if v_copy then
    insert into public.conversation_participants (conversation_id, user_id, last_read_at)
      select v_id, l.guardian_id, null from public.guardian_student_links l
      join public.institution_memberships m on m.user_id = l.guardian_id and m.institution_id = l.institution_id and m.status = 'active'
      where l.institution_id = p_inst and l.student_id = p_student
      on conflict do nothing;
  end if;
  insert into public.messages (institution_id, conversation_id, sender_id, body)
    values (p_inst, v_id, v_uid, p_body);
  return v_id;
end $$;
