-- 0014_community.sql — Comunidad: los comunicados pasan a ser publicaciones con imágenes, reacciones y comentarios.
-- Control: quien publica decide si se puede reaccionar y qué roles pueden comentar; puede cambiarlo después.
-- Moderación: quien publicó y el equipo directivo o la administración pueden ocultar comentarios.
-- Visibilidad: reacciones y comentarios solo existen para quien ya puede ver la publicación (misma regla de audiencia y curso).

alter table public.announcements
  add column image_paths text[] not null default '{}' check (cardinality(image_paths) <= 4),   -- bucket materials: {institution_id}/comunidad/{archivo}
  add column allow_reactions boolean not null default true,
  add column comment_roles public.member_role[] not null default '{}';                         -- vacío = comentarios desactivados
update public.announcements set comment_roles = audience;

-- Después de publicar solo se pueden cambiar los controles de interacción, no el contenido ni la audiencia.
revoke update on public.announcements from authenticated;
grant update (allow_reactions, comment_roles) on public.announcements to authenticated;
create policy announcements_update on public.announcements for update to authenticated
  using (author_id = (select auth.uid()) or app.has_role(institution_id, 'admin', 'directivo'))
  with check (author_id = (select auth.uid()) or app.has_role(institution_id, 'admin', 'directivo'));

-- ¿Puede esta persona moderar la publicación? (quien la publicó, dirección o administración)
create or replace function app.moderates_announcement(p_announcement uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.announcements a where a.id = p_announcement
    and (a.author_id = (select auth.uid()) or app.has_role(a.institution_id, 'admin', 'directivo')))
$$;
revoke execute on function app.moderates_announcement(uuid) from public, anon;
grant execute on function app.moderates_announcement(uuid) to authenticated, service_role;

-- ── Reacciones: una por persona y publicación ───────────────────────────────
create table public.announcement_reactions (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  kind text not null check (kind in ('like', 'love', 'celebrate', 'thanks')),
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create trigger announcement_reactions_same_inst before insert or update on public.announcement_reactions
  for each row execute function app.check_same_institution('announcement_id', 'announcements');

-- ── Comentarios ─────────────────────────────────────────────────────────────
create table public.announcement_comments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  -- Nombre y rol al momento de comentar: quien lee puede no tener acceso al perfil de quien escribió.
  author_name text not null default '',
  author_role text not null default '',
  body text not null check (char_length(body) between 1 and 1000),
  hidden_at timestamptz,
  hidden_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index announcement_comments_idx on public.announcement_comments (announcement_id, created_at);
create trigger announcement_comments_same_inst before insert or update on public.announcement_comments
  for each row execute function app.check_same_institution('announcement_id', 'announcements');

create or replace function app.stamp_comment_author() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select p.full_name into new.author_name from public.profiles p where p.id = new.author_id;
  new.author_name := coalesce(new.author_name, '');
  new.author_role := coalesce(app.my_role(new.institution_id), '');
  new.hidden_at := null; new.hidden_by := null;
  return new;
end $$;
create trigger announcement_comments_stamp before insert on public.announcement_comments
  for each row execute function app.stamp_comment_author();

alter table public.announcement_reactions enable row level security;
alter table public.announcement_comments enable row level security;
revoke all on public.announcement_reactions, public.announcement_comments from anon, authenticated;
grant select, insert, delete on public.announcement_reactions to authenticated;
grant update (kind) on public.announcement_reactions to authenticated;
grant select, insert, delete on public.announcement_comments to authenticated;
grant update (hidden_at, hidden_by) on public.announcement_comments to authenticated;

-- Las subconsultas a announcements pasan por su propia RLS: solo «existe» la publicación que la persona puede ver.
create policy reactions_select on public.announcement_reactions for select to authenticated
  using (app.is_member(institution_id) and exists (select 1 from public.announcements a where a.id = announcement_id));
create policy reactions_insert on public.announcement_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and app.is_member(institution_id)
              and exists (select 1 from public.announcements a where a.id = announcement_id and a.allow_reactions));
create policy reactions_update on public.announcement_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.announcements a where a.id = announcement_id and a.allow_reactions));
create policy reactions_delete on public.announcement_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy comments_select on public.announcement_comments for select to authenticated
  using (app.is_member(institution_id) and exists (select 1 from public.announcements a where a.id = announcement_id)
         and (hidden_at is null or author_id = (select auth.uid()) or app.moderates_announcement(announcement_id)));
create policy comments_insert on public.announcement_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and app.is_member(institution_id)
              and exists (select 1 from public.announcements a where a.id = announcement_id
                          and (app.my_role(a.institution_id) = any (a.comment_roles::text[]) or a.author_id = (select auth.uid()))));
create policy comments_moderate on public.announcement_comments for update to authenticated
  using (app.moderates_announcement(announcement_id)) with check (app.moderates_announcement(announcement_id));
create policy comments_delete on public.announcement_comments for delete to authenticated
  using (author_id = (select auth.uid()) or app.has_role(institution_id, 'admin'));
