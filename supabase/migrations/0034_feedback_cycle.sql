-- ── Evaluación de clases: más anonimato y ciclo de mejora con el docente ───────
-- 1. Anonimato: los promedios se muestran desde 5 respuestas (antes 3) y los comentarios escritos solo cuando el
--    mes reúne 10 o más: con pocos estudiantes, la forma de escribir puede delatar a quien respondió.
-- 2. Participación docente: cada docente ve sus propios resultados AGREGADOS (nunca los comentarios), puede leer
--    la lectura de ARIA que dirección decida compartirle, y registra las estrategias que va a aplicar.

create or replace function public.teacher_feedback_summary(p_inst uuid, p_teacher uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_dir boolean := app.has_role(p_inst, 'directivo');
  v_self boolean := p_teacher = (select auth.uid()) and app.has_role(p_inst, 'docente');
begin
  if not (v_dir or v_self) then raise exception 'not_authorized'; end if;
  return coalesce((
    select jsonb_agg(m.row order by m.month desc) from (
      select f.period_month as month, jsonb_build_object(
        'month', f.period_month, 'responses', count(*), 'score', round(avg(f.score), 2),
        'dims', jsonb_build_object(
          'claridad', round(avg(f.claridad), 2), 'ritmo', round(avg(f.ritmo), 2), 'participacion', round(avg(f.participacion), 2),
          'retroalimentacion', round(avg(f.retroalimentacion), 2), 'organizacion', round(avg(f.organizacion), 2), 'trato', round(avg(f.trato), 2)),
        -- Los comentarios son solo para dirección y solo con 10 o más respuestas en el mes.
        'comments', case when v_dir and count(*) >= 10 then coalesce((
          select jsonb_agg(c.comment order by md5(c.id::text)) from public.teacher_feedback c
          where c.institution_id = p_inst and c.teacher_id = p_teacher and c.period_month = f.period_month and coalesce(c.comment, '') <> ''), '[]'::jsonb)
          else '[]'::jsonb end,
        'comments_locked', v_dir and count(*) < 10,
        'groups', coalesce((
          select jsonb_agg(jsonb_build_object('course_id', g.course_id, 'subject_id', g.subject_id, 'responses', g.n, 'score', g.s)) from (
            select x.course_id, x.subject_id, count(*) as n, round(avg(x.score), 2) as s from public.teacher_feedback x
            where x.institution_id = p_inst and x.teacher_id = p_teacher and x.period_month = f.period_month
            group by x.course_id, x.subject_id having count(*) >= 5) g), '[]'::jsonb)
      ) as row
      from public.teacher_feedback f
      where f.institution_id = p_inst and f.teacher_id = p_teacher
      group by f.period_month having count(*) >= 5
    ) m), '[]'::jsonb);
end $$;

create or replace function public.teacher_feedback_overview(p_inst uuid, p_months int default 4) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_role(p_inst, 'directivo') then raise exception 'not_authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'teacher_id', g.teacher_id, 'course_id', g.course_id, 'subject_id', g.subject_id, 'month', g.period_month,
      'responses', g.n, 'score', g.score,
      'dims', jsonb_build_object('claridad', g.claridad, 'ritmo', g.ritmo, 'participacion', g.participacion,
        'retroalimentacion', g.retroalimentacion, 'organizacion', g.organizacion, 'trato', g.trato)))
    from (
      select f.teacher_id, f.course_id, f.subject_id, f.period_month, count(*) as n, round(avg(f.score), 2) as score,
        round(avg(f.claridad), 2) as claridad, round(avg(f.ritmo), 2) as ritmo, round(avg(f.participacion), 2) as participacion,
        round(avg(f.retroalimentacion), 2) as retroalimentacion, round(avg(f.organizacion), 2) as organizacion, round(avg(f.trato), 2) as trato
      from public.teacher_feedback f
      where f.institution_id = p_inst
        and f.period_month > (date_trunc('month', (now() at time zone 'America/Santiago')) - make_interval(months => greatest(1, least(p_months, 12))))::date
      group by f.teacher_id, f.course_id, f.subject_id, f.period_month
      having count(*) >= 5) g), '[]'::jsonb);
end $$;

-- Dirección decide si comparte con el docente la lectura de ARIA de un mes.
alter table public.teacher_feedback_insights add column shared_at timestamptz;
drop policy teacher_feedback_insights_select on public.teacher_feedback_insights;
create policy teacher_feedback_insights_select on public.teacher_feedback_insights for select to authenticated using (
  app.has_role(institution_id, 'directivo')
  or (teacher_id = (select auth.uid()) and shared_at is not null and app.has_role(institution_id, 'docente')));

-- Estrategias que el propio docente se propone aplicar, ligadas a un aspecto de la evaluación.
create table public.teaching_commitments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  focus text not null check (focus in ('claridad', 'ritmo', 'participacion', 'retroalimentacion', 'organizacion', 'trato', 'general')),
  action text not null check (char_length(action) between 5 and 1000),
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'done')),
  reflection text check (reflection is null or char_length(reflection) <= 1000),   -- qué pasó al aplicarla
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index teaching_commitments_teacher_idx on public.teaching_commitments (teacher_id, period_month desc);
create trigger teaching_commitments_updated before update on public.teaching_commitments for each row execute function app.set_updated_at();

alter table public.teaching_commitments enable row level security;
revoke all on public.teaching_commitments from anon, authenticated;
grant select, insert, update, delete on public.teaching_commitments to authenticated;
-- Las escribe solo su autor; dirección las lee para acompañar, no las edita.
create policy teaching_commitments_select on public.teaching_commitments for select to authenticated
  using ((teacher_id = (select auth.uid()) and app.is_member(institution_id)) or app.has_role(institution_id, 'directivo'));
create policy teaching_commitments_insert on public.teaching_commitments for insert to authenticated
  with check (teacher_id = (select auth.uid()) and app.has_role(institution_id, 'docente'));
create policy teaching_commitments_update on public.teaching_commitments for update to authenticated
  using (teacher_id = (select auth.uid()) and app.has_role(institution_id, 'docente'))
  with check (teacher_id = (select auth.uid()) and app.has_role(institution_id, 'docente'));
create policy teaching_commitments_delete on public.teaching_commitments for delete to authenticated
  using (teacher_id = (select auth.uid()) and app.has_role(institution_id, 'docente'));
