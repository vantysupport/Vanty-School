-- ── Evaluaciones sin entrega: pruebas, exámenes, controles, exposiciones ─────
-- Hasta ahora toda nota colgaba de una «tarea» que el estudiante entrega en la plataforma.
-- `kind` distingue las evaluaciones que se rinden en clases: no reciben entregas,
-- solo la nota que registra el docente.
alter table public.assignments
  add column kind text not null default 'tarea'
  check (kind in ('tarea', 'prueba', 'examen', 'control', 'exposicion', 'otra'));
