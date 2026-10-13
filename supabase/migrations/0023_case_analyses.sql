-- ── Análisis de ARIA guardados dentro de un caso de bienestar ────────────────
-- Cada vez que el equipo le pide a ARIA analizar un caso, la respuesta queda registrada en el caso:
-- se puede corregir, eliminar o pedir otra, y las anteriores siguen en el historial.
-- Es un apoyo redactado por una IA a partir del caso sin nombres; no es un diagnóstico ni una
-- intervención. Solo lo lee y lo modifica el equipo de bienestar del colegio.
create table public.wellbeing_case_analyses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  case_id uuid not null references public.wellbeing_cases(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  focus text check (focus is null or char_length(focus) <= 1500),          -- lo que se le pidió analizar; null = análisis general
  content text not null check (char_length(content) between 2 and 12000),
  edited_by uuid references public.profiles(id) on delete restrict,        -- quien corrigió el texto de ARIA, si alguien lo hizo
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index wellbeing_case_analyses_case_idx on public.wellbeing_case_analyses (case_id, created_at desc);
create trigger wellbeing_case_analyses_same_inst before insert or update on public.wellbeing_case_analyses
  for each row execute function app.check_same_institution('case_id', 'wellbeing_cases');

alter table public.wellbeing_case_analyses enable row level security;
revoke all on public.wellbeing_case_analyses from anon, authenticated;
grant select, insert, delete on public.wellbeing_case_analyses to authenticated;
grant update (content, edited_by, edited_at) on public.wellbeing_case_analyses to authenticated;

create policy wellbeing_case_analyses_select on public.wellbeing_case_analyses for select to authenticated
  using (app.has_role(institution_id, 'bienestar'));
create policy wellbeing_case_analyses_insert on public.wellbeing_case_analyses for insert to authenticated
  with check (requested_by = (select auth.uid()) and app.has_role(institution_id, 'bienestar'));
create policy wellbeing_case_analyses_update on public.wellbeing_case_analyses for update to authenticated
  using (app.has_role(institution_id, 'bienestar')) with check (app.has_role(institution_id, 'bienestar'));
create policy wellbeing_case_analyses_delete on public.wellbeing_case_analyses for delete to authenticated
  using (app.has_role(institution_id, 'bienestar'));
