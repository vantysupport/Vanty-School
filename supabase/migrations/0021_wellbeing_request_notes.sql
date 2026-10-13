-- ── Notas y respuestas del equipo de bienestar en una solicitud ──────────────
-- Hasta ahora el equipo solo podía cambiar estado y prioridad. Estas notas le permiten dejar
-- registro de lo que va haciendo y, cuando lo decide, responderle a quien pidió la ayuda.
-- Una nota interna solo la lee bienestar; una marcada como visible la lee además quien solicitó.
create table public.wellbeing_request_notes (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  request_id uuid not null references public.wellbeing_requests(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 2 and 4000),
  visible_to_requester boolean not null default false,
  created_at timestamptz not null default now()
);
create index wellbeing_request_notes_request_idx on public.wellbeing_request_notes (request_id, created_at);
create trigger wellbeing_request_notes_same_inst before insert or update on public.wellbeing_request_notes
  for each row execute function app.check_same_institution('request_id', 'wellbeing_requests');

alter table public.wellbeing_request_notes enable row level security;
revoke all on public.wellbeing_request_notes from anon, authenticated;
grant select, insert on public.wellbeing_request_notes to authenticated;

create or replace function app.is_requester(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.wellbeing_requests r where r.id = p_request and r.requested_by = (select auth.uid()))
$$;
revoke execute on function app.is_requester(uuid) from public, anon;
grant execute on function app.is_requester(uuid) to authenticated, service_role;

create policy wellbeing_request_notes_select on public.wellbeing_request_notes for select to authenticated
  using (app.is_member(institution_id) and (app.has_role(institution_id, 'bienestar') or (visible_to_requester and app.is_requester(request_id))));
create policy wellbeing_request_notes_insert on public.wellbeing_request_notes for insert to authenticated
  with check (author_id = (select auth.uid()) and app.has_role(institution_id, 'bienestar'));
