-- ── El apoderado ve cuando su pupilo pide ayuda por su cuenta ─────────────────
-- Hasta ahora una solicitud de apoyo enviada por el propio estudiante la veían solo él y el equipo de bienestar.
-- Ahora también la ve su apoderado (el tema, el texto y en qué va), con dos resguardos:
--   · Si el tema es «situación en casa», queda reservada: un niño que cuenta algo de su hogar no debe quedar expuesto
--     ante el adulto del que quizá está hablando.
--   · El equipo de bienestar puede reservar o liberar cualquier solicitud según su criterio profesional.
-- Las respuestas del equipo siguen siendo solo para quien pidió la ayuda.

alter table public.wellbeing_requests add column guardian_visible boolean not null default true;
update public.wellbeing_requests set guardian_visible = false where source = 'estudiante' and category = 'familiar';

-- La visibilidad inicial la fija la base, no quien envía el formulario.
create or replace function app.wellbeing_request_visibility() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.guardian_visible := not (new.source = 'estudiante' and new.category = 'familiar');
  return new;
end $$;
create trigger wellbeing_requests_visibility before insert on public.wellbeing_requests
  for each row execute function app.wellbeing_request_visibility();

drop policy wellbeing_requests_select on public.wellbeing_requests;
create policy wellbeing_requests_select on public.wellbeing_requests for select to authenticated using (
  app.has_role(institution_id, 'bienestar')
  or (requested_by = (select auth.uid()) and app.is_member(institution_id))
  or (source = 'estudiante' and guardian_visible and app.is_guardian_of(student_id)));
