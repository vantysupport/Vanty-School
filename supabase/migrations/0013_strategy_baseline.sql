-- 0013_strategy_baseline.sql — Estrategias de mejora conectadas con el análisis de rendimiento.
-- Cada estrategia puede apuntar a un grado completo (además de un curso o asignatura) y guarda la «línea base»:
-- los indicadores del alcance en el momento de registrarla, para comparar el antes y el ahora.

alter table public.improvement_strategies
  add column grade_level_id uuid references public.grade_levels(id) on delete set null,
  add column baseline jsonb,          -- { average, below_pct, attendance, submission_rate, feedback, graded, students, alerts }
  add column baseline_at timestamptz;

drop trigger improvement_strategies_same_inst on public.improvement_strategies;
create trigger improvement_strategies_same_inst before insert or update on public.improvement_strategies
  for each row execute function app.check_same_institution('course_id', 'courses', 'subject_id', 'subjects', 'grade_level_id', 'grade_levels');
