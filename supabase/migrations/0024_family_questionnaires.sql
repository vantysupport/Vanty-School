-- ── Cuestionarios para la familia ────────────────────────────────────────────
-- El equipo de bienestar puede enviar un cuestionario al apoderado para conocer mejor al estudiante.
-- El apoderado solo ve las preguntas y su propio envío. La guía de lectura del instrumento, la revisión
-- profesional y la lectura que hace ARIA quedan reservadas al equipo de bienestar.

-- A quién va dirigido un instrumento y una guía de lectura solo para el profesional.
alter table public.assessment_templates
  add column audience text not null default 'profesional' check (audience in ('profesional', 'apoderado')),
  add column reading_guide text not null default '' check (char_length(reading_guide) <= 4000);

-- Quién respondió (null = lo aplicó el profesional) y la lectura de ARIA para el equipo.
alter table public.assessment_responses
  add column respondent_id uuid references public.profiles(id) on delete restrict,
  add column aria_note text check (aria_note is null or char_length(aria_note) <= 12000),
  add column aria_note_at timestamptz;

-- Envíos a apoderados. Las preguntas se copian al envío: el apoderado no lee la tabla de instrumentos.
create table public.assessment_requests (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  template_id uuid not null references public.assessment_templates(id) on delete restrict,
  case_id uuid not null references public.wellbeing_cases(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  guardian_id uuid not null references public.profiles(id) on delete restrict,
  sent_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 160),
  intro text not null default '',
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  scoring_rule jsonb not null default '{"type":"none","note":""}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'answered', 'cancelled')),
  response_id uuid references public.assessment_responses(id) on delete set null,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index assessment_requests_guardian_idx on public.assessment_requests (guardian_id, status);
create index assessment_requests_inst_idx on public.assessment_requests (institution_id, created_at desc);
create trigger assessment_requests_same_inst before insert or update on public.assessment_requests
  for each row execute function app.check_same_institution('template_id', 'assessment_templates', 'case_id', 'wellbeing_cases');

alter table public.assessment_requests enable row level security;
revoke all on public.assessment_requests from anon, authenticated;
grant select, insert on public.assessment_requests to authenticated;
grant update (status) on public.assessment_requests to authenticated;

create policy assessment_requests_select on public.assessment_requests for select to authenticated
  using (app.has_role(institution_id, 'bienestar') or (guardian_id = (select auth.uid()) and app.has_role(institution_id, 'apoderado')));
create policy assessment_requests_insert on public.assessment_requests for insert to authenticated
  with check (sent_by = (select auth.uid()) and app.has_role(institution_id, 'bienestar') and status = 'pending' and response_id is null
              and exists (select 1 from public.guardian_student_links l
                          where l.institution_id = assessment_requests.institution_id and l.student_id = assessment_requests.student_id and l.guardian_id = assessment_requests.guardian_id));
-- El equipo puede anular un envío pendiente; el apoderado responde solo a través de la función de abajo.
create policy assessment_requests_update on public.assessment_requests for update to authenticated
  using (app.has_role(institution_id, 'bienestar') and status = 'pending') with check (app.has_role(institution_id, 'bienestar') and status in ('pending', 'cancelled'));

-- El apoderado responde su cuestionario. La función valida cada respuesta contra las preguntas del envío,
-- calcula el resultado con la regla documentada (si la hay) y deja la aplicación lista para la revisión profesional.
create or replace function public.answer_assessment_request(p_request uuid, p_answers jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.assessment_requests%rowtype;
  v_q jsonb; v_id text; v_raw text; v_n numeric;
  v_clean jsonb := '{}'::jsonb;
  v_sum numeric := 0; v_count int := 0; v_score numeric; v_rule text;
  v_response uuid;
begin
  if v_uid is null then raise exception 'not_authorized'; end if;
  select * into v_req from public.assessment_requests where id = p_request for update;
  if not found or v_req.guardian_id <> v_uid or not app.has_role(v_req.institution_id, 'apoderado') then raise exception 'not_authorized'; end if;
  if v_req.status <> 'pending' then raise exception 'already_answered'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'invalid_answers'; end if;

  for v_q in select * from jsonb_array_elements(v_req.questions) loop
    v_id := v_q->>'id';
    v_raw := btrim(coalesce(p_answers->>v_id, ''));
    if v_q->>'type' = 'scale' then
      if v_raw !~ '^\d{1,2}$' then raise exception 'missing_answer'; end if;
      v_n := v_raw::numeric;
      if v_n < coalesce((v_q->>'min')::numeric, 1) or v_n > coalesce((v_q->>'max')::numeric, 5) then raise exception 'invalid_answers'; end if;
      v_clean := v_clean || jsonb_build_object(v_id, v_n);
      v_sum := v_sum + v_n; v_count := v_count + 1;
    elsif v_raw <> '' then
      v_clean := v_clean || jsonb_build_object(v_id, left(v_raw, 2000));
    end if;
  end loop;

  v_rule := coalesce(v_req.scoring_rule->>'type', 'none');
  v_score := case when v_rule = 'sum' then v_sum when v_rule = 'mean' and v_count > 0 then round(v_sum / v_count, 2) else null end;

  insert into public.assessment_responses (institution_id, template_id, case_id, student_id, administered_by, respondent_id, answers, computed_score)
    values (v_req.institution_id, v_req.template_id, v_req.case_id, v_req.student_id, v_req.sent_by, v_uid, v_clean, v_score)
    returning id into v_response;
  update public.assessment_requests set status = 'answered', answered_at = now(), response_id = v_response where id = p_request;
  return v_response;
end $$;
revoke execute on function public.answer_assessment_request(uuid, jsonb) from public, anon;
grant execute on function public.answer_assessment_request(uuid, jsonb) to authenticated;
