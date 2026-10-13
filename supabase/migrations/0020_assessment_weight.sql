-- ── Ponderación opcional de una tarea o evaluación ───────────────────────────
-- `weight` es el porcentaje del promedio de la asignatura que vale esa actividad
-- (por ejemplo, examen = 30). Si queda vacío, la actividad se reparte en partes
-- iguales con las demás sin porcentaje el tramo que no esté asignado.
-- La aplicación impide que los porcentajes de un curso y asignatura sumen más de 100.
alter table public.assignments
  add column weight numeric(5,2) check (weight > 0 and weight <= 100);
