-- 0011_avatars.sql — Foto de perfil. Cada persona sube la suya; el archivo es privado.
-- Ruta en Storage: avatars/{user_id}/{archivo}. Solo la ve quien ya puede ver el perfil de esa persona.

alter table public.profiles add column avatar_path text;
grant update (avatar_path) on public.profiles to authenticated;

-- La ruta guardada debe estar dentro de la carpeta de la propia persona (ni la administración puede apuntarla a otra).
create or replace function app.guard_avatar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.avatar_path is distinct from old.avatar_path and (select auth.uid()) is not null then
    if new.id <> (select auth.uid()) and new.avatar_path is not null then
      raise exception 'Solo la propia persona puede definir su foto' using errcode = '42501';
    end if;
    if new.avatar_path is not null and new.avatar_path not like new.id::text || '/%' then
      raise exception 'Ruta de foto inválida' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_avatar_guard before update on public.profiles
  for each row execute function app.guard_avatar();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;

create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or app.can_view_profile(app.safe_uuid((storage.foldername(name))[1]))));
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
