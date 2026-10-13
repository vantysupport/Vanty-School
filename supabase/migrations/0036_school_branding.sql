-- 0036_school_branding.sql — Identidad de cada colegio: logo, color, dirección y teléfono.
--
-- El logo se guarda en Storage, en un bucket público (no es un dato sensible y debe verse en la pantalla de
-- invitación, antes de iniciar sesión). Ruta: school-logos/{institution_id}/{archivo}.
-- Lo suben la secretaría del colegio o el equipo Vanty; nadie más.

alter table public.institutions
  add column logo_path text,
  add column brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  add column address text check (address is null or char_length(address) <= 160),
  add column phone text check (phone is null or char_length(phone) <= 40),
  -- La ruta del logo siempre queda dentro de la carpeta del propio colegio.
  add constraint institutions_logo_path_check check (logo_path is null or (logo_path like id::text || '/%' and logo_path !~ '\.\.' and char_length(logo_path) <= 200));

grant update (logo_path, brand_color, address, phone) on public.institutions to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('school-logos', 'school-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;

create policy school_logos_read on storage.objects for select to authenticated
  using (bucket_id = 'school-logos' and (app.is_platform() or app.is_member(app.safe_uuid((storage.foldername(name))[1]))));
create policy school_logos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'school-logos' and (app.is_platform() or app.has_role(app.safe_uuid((storage.foldername(name))[1]), 'admin')));
create policy school_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'school-logos' and (app.is_platform() or app.has_role(app.safe_uuid((storage.foldername(name))[1]), 'admin')));

-- Identidad de todos los colegios, para el panel del equipo Vanty (las cifras siguen en platform_overview).
create or replace function public.platform_branding() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_platform();
  return coalesce((select jsonb_object_agg(i.id, jsonb_build_object('logo_path', i.logo_path, 'brand_color', i.brand_color, 'address', i.address, 'phone', i.phone)) from public.institutions i), '{}'::jsonb);
end $$;

create or replace function public.platform_set_branding(p_inst uuid, p_color text, p_address text, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform();
  update public.institutions set brand_color = nullif(btrim(p_color), ''), address = nullif(btrim(p_address), ''), phone = nullif(btrim(p_phone), '') where id = p_inst;
  if not found then raise exception 'Colegio no encontrado.' using errcode = 'P0002'; end if;
end $$;

create or replace function public.platform_set_logo(p_inst uuid, p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  perform app.require_platform();
  select logo_path into v_old from public.institutions where id = p_inst;
  if not found then raise exception 'Colegio no encontrado.' using errcode = 'P0002'; end if;
  update public.institutions set logo_path = nullif(p_path, '') where id = p_inst;
  return v_old;   -- para que la aplicación borre el archivo anterior
end $$;

revoke all on function public.platform_branding(), public.platform_set_branding(uuid, text, text, text), public.platform_set_logo(uuid, text) from public, anon;
grant execute on function public.platform_branding(), public.platform_set_branding(uuid, text, text, text), public.platform_set_logo(uuid, text) to authenticated;
