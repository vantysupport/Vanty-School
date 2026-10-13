-- 0010_teacher_feedback.sql — Evaluación mensual de las clases por parte de los estudiantes.
-- Propósito: retroalimentación para la mejora docente. No es una evaluación de desempeño ni base para sanciones.
-- Anonimato: nadie más que el propio estudiante puede leer su respuesta. Dirección solo accede a agregados
-- mediante una función que exige un mínimo de respuestas, de modo que no se pueda deducir quién opinó.

create table public.teacher_feedback (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  period_month date not null check (extract(day from period_month) = 1),
  claridad smallint not null check (claridad between 1 and 5),                   -- explica de forma que se entiende
  ritmo smallint not null check (ritmo between 1 and 5),                         -- el ritmo permite seguir la clase
  participacion smallint not null check (participacion between 1 and 5),         -- se puede preguntar y participar
  retroalimentacion smallint not null check (retroalimentacion between 1 and 5), -- indica cómo mejorar los trabajos
  organizacion smallint not null check (organizacion between 1 and 5),           -- clase ordenada, aprovecha el tiempo
  trato smallint not null check (trato between 1 and 5),                         -- trato respetuoso
  score numeric(3,2) generated always as ((claridad + ritmo + participacion + retroalimentacion + organizacion + trato) / 6.0) stored,
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (student_id, teacher_id, course_id, subject_id, period_month)
);
create index teacher_feedback_teacher_idx on public.teacher_feedback (institution_id, teacher_id, period_month);
create trigger teacher_feedback_same_inst before insert or update on public.teacher_feedback
  for each row execute function app.check_same_institution('course_id', 'courses', 'subject_id', 'subjects');

-- Análisis de ARIA sobre los resultados agregados de un mes.
create table public.teacher_feedback_insights (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  period_month date not null,
  content text not null,
  provider text,
  model text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (teacher_id, period_month, institution_id)
);

alter table public.teacher_feedback enable row level security;
alter table public.teacher_feedback_insights enable row level security;
revoke all on public.teacher_feedback, public.teacher_feedback_insights from anon, authenticated;
grant select, insert on public.teacher_feedback to authenticated;
grant select, insert, update on public.teacher_feedback_insights to authenticated;

create or replace function app.is_course_teacher(p_teacher uuid, p_course uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teacher_assignments ta where ta.teacher_id = p_teacher and ta.course_id = p_course and ta.subject_id = p_subject)
$$;
revoke execute on function app.is_course_teacher(uuid, uuid, uuid) from public, anon;
grant execute on function app.is_course_teacher(uuid, uuid, uuid) to authenticated, service_role;

-- El estudiante solo ve y crea sus propias respuestas, del mes en curso, sobre docentes de su curso.
create policy teacher_feedback_select on public.teacher_feedback for select to authenticated
  using (student_id = (select auth.uid()) and app.is_member(institution_id));
create policy teacher_feedback_insert on public.teacher_feedback for insert to authenticated
  with check (student_id = (select auth.uid()) and app.has_role(institution_id, 'estudiante') and app.is_enrolled(course_id)
              and app.is_course_teacher(teacher_id, course_id, subject_id)
              and period_month = date_trunc('month', (now() at time zone 'America/Santiago'))::date);

create policy teacher_feedback_insights_select on public.teacher_feedback_insights for select to authenticated
  using (app.has_role(institution_id, 'directivo'));
create policy teacher_feedback_insights_insert on public.teacher_feedback_insights for insert to authenticated
  with check (created_by = (select auth.uid()) and app.has_role(institution_id, 'directivo'));
create policy teacher_feedback_insights_update on public.teacher_feedback_insights for update to authenticated
  using (app.has_role(institution_id, 'directivo')) with check (app.has_role(institution_id, 'directivo'));

-- Resultados agregados por mes. Solo dirección; solo meses (y grupos) con 3 o más respuestas.
create or replace function public.teacher_feedback_summary(p_inst uuid, p_teacher uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_role(p_inst, 'directivo') then raise exception 'not_authorized'; end if;
  return coalesce((
    select jsonb_agg(m.row order by m.month desc) from (
      select f.period_month as month, jsonb_build_object(
        'month', f.period_month, 'responses', count(*), 'score', round(avg(f.score), 2),
        'dims', jsonb_build_object(
          'claridad', round(avg(f.claridad), 2), 'ritmo', round(avg(f.ritmo), 2), 'participacion', round(avg(f.participacion), 2),
          'retroalimentacion', round(avg(f.retroalimentacion), 2), 'organizacion', round(avg(f.organizacion), 2), 'trato', round(avg(f.trato), 2)),
        'comments', coalesce((
          select jsonb_agg(c.comment order by md5(c.id::text)) from public.teacher_feedback c
          where c.institution_id = p_inst and c.teacher_id = p_teacher and c.period_month = f.period_month and coalesce(c.comment, '') <> ''), '[]'::jsonb),
        'groups', coalesce((
          select jsonb_agg(jsonb_build_object('course_id', g.course_id, 'subject_id', g.subject_id, 'responses', g.n, 'score', g.s)) from (
            select x.course_id, x.subject_id, count(*) as n, round(avg(x.score), 2) as s from public.teacher_feedback x
            where x.institution_id = p_inst and x.teacher_id = p_teacher and x.period_month = f.period_month
            group by x.course_id, x.subject_id having count(*) >= 3) g), '[]'::jsonb)
      ) as row
      from public.teacher_feedback f
      where f.institution_id = p_inst and f.teacher_id = p_teacher
      group by f.period_month having count(*) >= 3
    ) m), '[]'::jsonb);
end $$;
revoke execute on function public.teacher_feedback_summary(uuid, uuid) from public, anon;
grant execute on function public.teacher_feedback_summary(uuid, uuid) to authenticated;

-- Datos de demostración: tres meses de respuestas ficticias en el colegio demo.
do $$
declare v_inst uuid; r record; m integer; v_h integer; v_month date; v_slow boolean;
begin
  select id into v_inst from public.institutions where name = 'Colegio Futuro Andino' and is_demo;
  if v_inst is null or exists (select 1 from public.teacher_feedback where institution_id = v_inst) then return; end if;
  for m in 0..2 loop
    v_month := (date_trunc('month', current_date) - make_interval(months => m))::date;
    for r in
      select e.student_id, ta.teacher_id, ta.course_id, ta.subject_id, c.name as course, s.code
      from public.course_enrollments e
      join public.teacher_assignments ta on ta.course_id = e.course_id
      join public.courses c on c.id = e.course_id
      join public.subjects s on s.id = ta.subject_id
      join public.profiles p on p.id = e.student_id
      where e.institution_id = v_inst and e.status = 'active'
        -- La cuenta demo de estudiante queda sin responder el mes en curso, para poder mostrar el flujo.
        and not (m = 0 and p.email = 'est06@futuroandino.example')
    loop
      v_h := abs(hashtext(r.student_id::text || r.teacher_id::text || r.subject_id::text || m::text));
      -- En Matemática de 7.º básico el ritmo y la claridad salen más bajos: es el caso que se usa en la demostración.
      v_slow := r.course = '7.º básico A' and r.code = 'MAT';
      insert into public.teacher_feedback (institution_id, teacher_id, course_id, subject_id, student_id, period_month,
                                           claridad, ritmo, participacion, retroalimentacion, organizacion, trato, comment, created_at)
      values (v_inst, r.teacher_id, r.course_id, r.subject_id, r.student_id, v_month,
        case when v_slow then 2 + (v_h % 2) + (case when m = 0 then 1 else 0 end) else 4 + (v_h % 2) end,
        case when v_slow then 2 + ((v_h / 3) % 2) else 3 + ((v_h / 3) % 3) end,
        4 + ((v_h / 5) % 2), 3 + ((v_h / 7) % 3), 4 + ((v_h / 11) % 2), 5 - ((v_h / 13) % 2),
        case when v_slow and v_h % 2 = 0 then 'A veces la materia pasa muy rápido y me pierdo en los ejercicios. (Comentario ficticio.)'
             when v_slow then 'Me ayudaría que hiciéramos más ejemplos antes de la guía. (Comentario ficticio.)'
             when v_h % 9 = 0 then 'Me gusta cuando hacemos trabajos en grupo. (Comentario ficticio.)' else null end,
        least(v_month + interval '20 days', now()));
    end loop;
  end loop;
end $$;
