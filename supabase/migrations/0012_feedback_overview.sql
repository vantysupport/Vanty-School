-- 0012_feedback_overview.sql — Panorama de la evaluación mensual de clases para el análisis de rendimiento.
-- Solo dirección. Devuelve agregados por docente, curso, asignatura y mes, y únicamente de grupos con 3 o más
-- respuestas: nunca respuestas individuales ni comentarios. Uso: orientar apoyos, no calificar docentes.

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
      having count(*) >= 3) g), '[]'::jsonb);
end $$;
revoke execute on function public.teacher_feedback_overview(uuid, int) from public, anon;
grant execute on function public.teacher_feedback_overview(uuid, int) to authenticated;
