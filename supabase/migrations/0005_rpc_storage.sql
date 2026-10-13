-- 0005_rpc_storage.sql — Funciones invocables por la aplicación y almacenamiento de archivos.
-- Las funciones públicas son SECURITY DEFINER y validan a quien llama antes de hacer nada.

-- ── Cuota diaria de ARIA ────────────────────────────────────────────────────
create or replace function public.ai_register_usage(p_inst uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_enabled boolean;
  v_limit integer;
  v_used integer;
begin
  if v_uid is null or not app.is_member(p_inst) then
    raise exception 'not_authorized';
  end if;
  select ai_enabled, ai_daily_limit_per_user into v_enabled, v_limit
    from public.institution_settings where institution_id = p_inst;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('allowed', false, 'reason', 'disabled', 'used', 0, 'limit', coalesce(v_limit, 0));
  end if;
  insert into public.ai_usage (institution_id, user_id, day, requests)
    values (p_inst, v_uid, current_date, 0)
    on conflict (institution_id, user_id, day) do nothing;
  update public.ai_usage set requests = requests + 1
    where institution_id = p_inst and user_id = v_uid and day = current_date and requests < v_limit
    returning requests into v_used;
  if v_used is null then
    return jsonb_build_object('allowed', false, 'reason', 'limit', 'used', v_limit, 'limit', v_limit);
  end if;
  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit);
end $$;

-- Cierra el registro de una consulta: suma tokens o devuelve el cupo si el proveedor falló.
create or replace function public.ai_settle_usage(p_inst uuid, p_tokens integer, p_refund boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.is_member(p_inst) then
    raise exception 'not_authorized';
  end if;
  update public.ai_usage
     set tokens = tokens + greatest(coalesce(p_tokens, 0), 0),
         requests = case when p_refund then greatest(requests - 1, 0) else requests end
   where institution_id = p_inst and user_id = v_uid and day = current_date;
end $$;

-- ── Mensajería: solo entre personas con una relación educativa real ──────────
create or replace function public.start_conversation(
  p_inst uuid, p_recipient uuid, p_student uuid, p_subject text, p_body text, p_kind text default 'message'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_me text := app.my_role(p_inst);
  v_other text;
  v_ok boolean := false;
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
    v_ok := v_other = 'apoderado' and exists (
              select 1 from public.guardian_student_links l
              where l.institution_id = p_inst and l.student_id = p_student and l.guardian_id = p_recipient);
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
  insert into public.messages (institution_id, conversation_id, sender_id, body)
    values (p_inst, v_id, v_uid, p_body);
  return v_id;
end $$;

create or replace function app.touch_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger messages_touch after insert on public.messages
  for each row execute function app.touch_conversation();

-- ── Revocar las sesiones de un usuario del colegio ──────────────────────────
create or replace function public.admin_revoke_sessions(p_inst uuid, p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not app.has_role(p_inst, 'admin') then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.institution_memberships m where m.institution_id = p_inst and m.user_id = p_user) then
    raise exception 'not_found';
  end if;
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.ai_register_usage(uuid), public.ai_settle_usage(uuid, integer, boolean),
  public.start_conversation(uuid, uuid, uuid, text, text, text), public.admin_revoke_sessions(uuid, uuid) from public, anon;
grant execute on function public.ai_register_usage(uuid), public.ai_settle_usage(uuid, integer, boolean),
  public.start_conversation(uuid, uuid, uuid, text, text, text), public.admin_revoke_sessions(uuid, uuid) to authenticated;

-- ── Storage ─────────────────────────────────────────────────────────────────
-- materials:   {institution_id}/{archivo}                              material, documentos y adjuntos de tareas
-- submissions: {institution_id}/{assignment_id}/{student_id}/{archivo}  entregas de estudiantes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('materials', 'materials', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  ('submissions', 'submissions', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy materials_read on storage.objects for select to authenticated
  using (bucket_id = 'materials' and app.is_member(app.safe_uuid((storage.foldername(name))[1])));
create policy materials_write on storage.objects for insert to authenticated
  with check (bucket_id = 'materials'
              and app.has_role(app.safe_uuid((storage.foldername(name))[1]), 'admin', 'directivo', 'docente'));
create policy materials_delete on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and owner_id = (select auth.uid())::text
         and app.has_role(app.safe_uuid((storage.foldername(name))[1]), 'admin', 'directivo', 'docente'));

create policy submissions_read on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and app.is_member(app.safe_uuid((storage.foldername(name))[1])) and (
    (storage.foldername(name))[3] = (select auth.uid())::text
    or app.is_guardian_of(app.safe_uuid((storage.foldername(name))[3]))
    or app.teaches_assignment(app.safe_uuid((storage.foldername(name))[2]))));
create policy submissions_write on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and (storage.foldername(name))[3] = (select auth.uid())::text
              and app.can_submit(app.safe_uuid((storage.foldername(name))[2]), app.safe_uuid((storage.foldername(name))[1])));
