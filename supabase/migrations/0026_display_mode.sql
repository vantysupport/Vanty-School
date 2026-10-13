-- ── Cómo ve su panel cada estudiante ─────────────────────────────────────────
-- 'auto' sigue al curso (los cursos chicos usan el modo simple); 'simple' y 'completo' son la elección
-- explícita de la persona desde «Mi perfil». Es una preferencia de presentación: no cambia permisos.
alter table public.profiles
  add column display_mode text not null default 'auto' check (display_mode in ('auto', 'simple', 'completo'));
grant update (display_mode) on public.profiles to authenticated;
