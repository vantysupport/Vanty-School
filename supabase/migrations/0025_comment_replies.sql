-- ── Responder a un comentario en Comunidad ───────────────────────────────────
-- Un comentario puede citar a otro de la misma publicación. Si el comentario citado se elimina,
-- la respuesta se conserva sin la cita.
alter table public.announcement_comments
  add column parent_id uuid references public.announcement_comments(id) on delete set null;

-- Solo se responde a comentarios visibles de la misma publicación.
create or replace function app.check_comment_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.announcement_comments p
    where p.id = new.parent_id and p.announcement_id = new.announcement_id and p.hidden_at is null) then
    raise exception 'El comentario al que respondes no está disponible' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger announcement_comments_parent before insert on public.announcement_comments
  for each row execute function app.check_comment_parent();
