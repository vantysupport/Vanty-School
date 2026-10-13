-- 0035_platform.sql — Equipo Vanty: alta y puesta en marcha de colegios.
--
-- Hasta ahora los colegios solo se creaban por SQL. Esta migración agrega el nivel de plataforma:
--   · platform_staff: quiénes del equipo Vanty pueden administrar colegios. No es un rol dentro de un colegio.
--   · platform_invitations: la única vía de alta al equipo, igual que en los colegios (enlace de un solo uso).
--   · Funciones platform_*: crean un colegio con su base lista (configuración, semestres, grados y asignaturas),
--     invitan a su secretaría o dirección y lo suspenden o reactivan.
--
-- Resguardo central: el equipo Vanty ve CIFRAS de cada colegio, nunca notas, fichas ni datos de estudiantes.
-- Estas funciones solo devuelven conteos y los contactos de administración. Las políticas RLS de las tablas
-- de cada colegio no cambian: ser del equipo Vanty no da acceso a ellas.

create table public.platform_staff (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.platform_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and position('@' in email) > 1),
  full_name text not null check (char_length(full_name) between 2 and 160),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  revoked_at timestamptz,
  created_by uuid references public.profiles(id),   -- null: la primera invitación, creada desde el servidor
  created_at timestamptz not null default now()
);

create or replace function app.is_platform() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_staff s where s.user_id = (select auth.uid()))
$$;

alter table public.platform_staff enable row level security;
alter table public.platform_invitations enable row level security;
revoke all on public.platform_staff, public.platform_invitations from anon, authenticated;
grant select on public.platform_staff, public.platform_invitations to authenticated;
-- Cada persona puede saber si ella misma es del equipo; el listado completo solo lo ve el equipo.
create policy platform_staff_select on public.platform_staff for select to authenticated
  using (user_id = (select auth.uid()) or app.is_platform());
create policy platform_invitations_select on public.platform_invitations for select to authenticated
  using (app.is_platform());

create or replace function app.require_platform() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform() then raise exception 'Solo el equipo Vanty puede realizar esta acción.' using errcode = '42501'; end if;
end $$;

-- ── Vista general: una fila por colegio, solo con cifras ─────────────────────
create or replace function public.platform_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_platform();
  return coalesce((
    select jsonb_agg(t.item order by (t.item ->> 'is_demo')::boolean, t.item ->> 'name')
    from (
      select jsonb_build_object(
        'id', i.id, 'name', i.name, 'rbd', i.rbd, 'dependency', i.dependency, 'commune', i.commune, 'region', i.region,
        'status', i.status, 'is_demo', i.is_demo, 'created_at', i.created_at,
        'students', count(*) filter (where m.role = 'estudiante' and m.status = 'active'),
        'teachers', count(*) filter (where m.role = 'docente' and m.status = 'active'),
        'guardians', count(*) filter (where m.role = 'apoderado' and m.status = 'active'),
        'admins', count(*) filter (where m.role = 'admin' and m.status = 'active'),
        'directors', count(*) filter (where m.role = 'directivo' and m.status = 'active'),
        'courses', (select count(*) from public.courses c join public.academic_periods p on p.id = c.period_id where c.institution_id = i.id and p.is_current),
        'pending_invites', (select count(*) from public.invitations v where v.institution_id = i.id and v.role in ('admin', 'directivo') and v.accepted_at is null and v.revoked_at is null and v.expires_at > now())
      ) as item
      from public.institutions i
      left join public.institution_memberships m on m.institution_id = i.id
      group by i.id
    ) t
  ), '[]'::jsonb);
end $$;

-- ── Ficha de un colegio: datos, avance de la puesta en marcha y cuentas de administración ──
create or replace function public.platform_institution(p_inst uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform app.require_platform();
  select jsonb_build_object(
    'id', i.id, 'name', i.name, 'rbd', i.rbd, 'dependency', i.dependency, 'commune', i.commune, 'region', i.region,
    'status', i.status, 'is_demo', i.is_demo, 'created_at', i.created_at,
    'period', (select jsonb_build_object('name', p.name, 'year', p.year, 'starts_on', p.starts_on, 'ends_on', p.ends_on) from public.academic_periods p where p.institution_id = i.id and p.is_current),
    'grade_levels', (select count(*) from public.grade_levels g where g.institution_id = i.id),
    'subjects', (select count(*) from public.subjects s where s.institution_id = i.id),
    'courses', (select count(*) from public.courses c join public.academic_periods p on p.id = c.period_id where c.institution_id = i.id and p.is_current),
    'assignments', (select count(*) from public.teacher_assignments a where a.institution_id = i.id),
    'links', (select count(*) from public.guardian_student_links l where l.institution_id = i.id),
    'members', (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb) from (select m.role::text, count(*) n from public.institution_memberships m where m.institution_id = i.id and m.status = 'active' group by 1) r),
    -- Solo las personas que administran el colegio: son el contacto del equipo Vanty.
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object('name', pr.full_name, 'email', pr.email, 'role', m.role, 'status', m.status) order by m.role, pr.full_name), '[]'::jsonb)
                 from public.institution_memberships m join public.profiles pr on pr.id = m.user_id
                 where m.institution_id = i.id and m.role in ('admin', 'directivo') and m.status <> 'removed'),
    'invitations', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'email', v.email, 'name', v.full_name, 'role', v.role, 'expires_at', v.expires_at,
                      'state', case when v.accepted_at is not null then 'accepted' when v.revoked_at is not null then 'revoked' when v.expires_at <= now() then 'expired' else 'pending' end) order by v.created_at desc), '[]'::jsonb)
                    from public.invitations v where v.institution_id = i.id and v.role in ('admin', 'directivo'))
  ) into v from public.institutions i where i.id = p_inst;
  return v;
end $$;

-- ── Alta de un colegio con su base lista para que secretaría continúe ────────
create or replace function public.platform_create_institution(
  p_name text, p_rbd text, p_dependency text, p_commune text, p_region text, p_year integer, p_stages text[], p_subjects boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_inst uuid; v_now date := current_date; v_first boolean;
begin
  perform app.require_platform();
  if p_year not between 2000 and 2100 then raise exception 'Año escolar fuera de rango.' using errcode = '23514'; end if;
  if exists (select 1 from public.institutions where lower(name) = lower(btrim(p_name))) then
    raise exception 'Ya existe un colegio con ese nombre.' using errcode = '23505';
  end if;

  insert into public.institutions (name, rbd, dependency, commune, region)
    values (btrim(p_name), nullif(btrim(p_rbd), ''), p_dependency, nullif(btrim(p_commune), ''), nullif(btrim(p_region), ''))
    returning id into v_inst;
  insert into public.institution_settings (institution_id) values (v_inst);

  -- Dos semestres, como trabaja el resto de la aplicación. Queda vigente el que corresponde a hoy.
  v_first := not (extract(year from v_now) = p_year and v_now >= make_date(p_year, 7, 22));
  insert into public.academic_periods (institution_id, name, year, starts_on, ends_on, is_current) values
    (v_inst, 'Primer semestre', p_year, make_date(p_year, 3, 3), make_date(p_year, 7, 21), v_first),
    (v_inst, 'Segundo semestre', p_year, make_date(p_year, 7, 31), make_date(p_year, 12, 8), not v_first);

  insert into public.grade_levels (institution_id, name, stage, sort_order)
    select v_inst, g.name, g.stage, g.sort_order
    from (values ('Pre-kínder', 'parvularia', 1), ('Kínder', 'parvularia', 2),
                 ('1.º básico', 'basica', 3), ('2.º básico', 'basica', 4), ('3.º básico', 'basica', 5), ('4.º básico', 'basica', 6),
                 ('5.º básico', 'basica', 7), ('6.º básico', 'basica', 8), ('7.º básico', 'basica', 9), ('8.º básico', 'basica', 10),
                 ('1.º medio', 'media', 11), ('2.º medio', 'media', 12), ('3.º medio', 'media', 13), ('4.º medio', 'media', 14)) as g(name, stage, sort_order)
    where g.stage = any (p_stages);

  if p_subjects then
    insert into public.subjects (institution_id, name, code)
      select v_inst, s.name, s.code
      from (values ('Lenguaje y Comunicación', 'LEN', array['parvularia', 'basica']), ('Lengua y Literatura', 'LYL', array['basica', 'media']),
                   ('Matemática', 'MAT', array['parvularia', 'basica', 'media']), ('Ciencias Naturales', 'CNA', array['basica', 'media']),
                   ('Historia, Geografía y Ciencias Sociales', 'HIS', array['basica', 'media']), ('Inglés', 'ING', array['basica', 'media']),
                   ('Artes Visuales', 'ART', array['parvularia', 'basica', 'media']), ('Música', 'MUS', array['parvularia', 'basica', 'media']),
                   ('Educación Física y Salud', 'EFI', array['parvularia', 'basica', 'media']), ('Tecnología', 'TEC', array['basica', 'media']),
                   ('Orientación', 'ORI', array['basica', 'media']), ('Religión', 'REL', array['basica', 'media']),
                   ('Ciencias para la Ciudadanía', 'CPC', array['media']), ('Educación Ciudadana', 'EDC', array['media']), ('Filosofía', 'FIL', array['media'])) as s(name, code, stages)
      where s.stages && p_stages;
  end if;

  insert into public.audit_logs (institution_id, actor_id, action, entity, entity_id, metadata)
    values (v_inst, (select auth.uid()), 'platform.institution.create', 'institution', v_inst::text, jsonb_build_object('stages', p_stages, 'subjects', p_subjects));
  return v_inst;
end $$;

create or replace function public.platform_update_institution(p_inst uuid, p_name text, p_rbd text, p_dependency text, p_commune text, p_region text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform();
  if exists (select 1 from public.institutions where lower(name) = lower(btrim(p_name)) and id <> p_inst) then
    raise exception 'Ya existe un colegio con ese nombre.' using errcode = '23505';
  end if;
  update public.institutions set name = btrim(p_name), rbd = nullif(btrim(p_rbd), ''), dependency = p_dependency,
    commune = nullif(btrim(p_commune), ''), region = nullif(btrim(p_region), '') where id = p_inst;
  if not found then raise exception 'Colegio no encontrado.' using errcode = 'P0002'; end if;
  insert into public.audit_logs (institution_id, actor_id, action, entity, entity_id) values (p_inst, (select auth.uid()), 'platform.institution.update', 'institution', p_inst::text);
end $$;

-- Suspender corta el acceso de todas las cuentas del colegio (app.my_role exige colegio activo) sin borrar nada.
create or replace function public.platform_set_status(p_inst uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_demo boolean;
begin
  perform app.require_platform();
  if p_status not in ('active', 'suspended') then raise exception 'Estado inválido.' using errcode = '23514'; end if;
  select is_demo into v_demo from public.institutions where id = p_inst;
  if not found then raise exception 'Colegio no encontrado.' using errcode = 'P0002'; end if;
  if v_demo and p_status = 'suspended' then raise exception 'El colegio de demostración no se puede suspender.' using errcode = '23514'; end if;
  update public.institutions set status = p_status where id = p_inst;
  insert into public.audit_logs (institution_id, actor_id, action, entity, entity_id, metadata)
    values (p_inst, (select auth.uid()), 'platform.institution.status', 'institution', p_inst::text, jsonb_build_object('status', p_status));
end $$;

-- El equipo Vanty solo invita a quienes administran el colegio; ellos crean el resto de las cuentas.
create or replace function public.platform_invite(p_inst uuid, p_email text, p_full_name text, p_role text, p_token_hash text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_days integer; v_id uuid;
begin
  perform app.require_platform();
  if p_role not in ('admin', 'directivo') then raise exception 'El equipo Vanty solo invita a secretaría o dirección.' using errcode = '23514'; end if;
  if not exists (select 1 from public.institutions where id = p_inst and status = 'active') then raise exception 'El colegio no está activo.' using errcode = '23514'; end if;
  if exists (select 1 from public.invitations where institution_id = p_inst and email = lower(btrim(p_email)) and accepted_at is null and revoked_at is null and expires_at > now()) then
    raise exception 'Ya hay una invitación vigente para ese correo.' using errcode = '23505';
  end if;
  select coalesce(invitation_ttl_days, 7) into v_days from public.institution_settings where institution_id = p_inst;
  v_days := coalesce(v_days, 7);
  insert into public.invitations (institution_id, email, full_name, role, token_hash, expires_at, created_by)
    values (p_inst, lower(btrim(p_email)), btrim(p_full_name), p_role::public.member_role, p_token_hash, now() + make_interval(days => v_days), (select auth.uid()))
    returning id into v_id;
  insert into public.audit_logs (institution_id, actor_id, action, entity, entity_id, metadata)
    values (p_inst, (select auth.uid()), 'user.invite', 'invitation', v_id::text, jsonb_build_object('role', p_role, 'by', 'platform'));
  return v_days;
end $$;

create or replace function public.platform_revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inst uuid;
begin
  perform app.require_platform();
  update public.invitations set revoked_at = now() where id = p_id and role in ('admin', 'directivo') and accepted_at is null and revoked_at is null
    returning institution_id into v_inst;
  if v_inst is null then raise exception 'La invitación ya no está vigente.' using errcode = 'P0002'; end if;
  insert into public.audit_logs (institution_id, actor_id, action, entity, entity_id) values (v_inst, (select auth.uid()), 'user.invite.revoke', 'invitation', p_id::text);
end $$;

-- ── Equipo Vanty ─────────────────────────────────────────────────────────────
create or replace function public.platform_team() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_platform();
  return jsonb_build_object(
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('id', s.user_id, 'name', p.full_name, 'email', p.email, 'since', s.created_at, 'me', s.user_id = (select auth.uid())) order by s.created_at), '[]'::jsonb)
              from public.platform_staff s join public.profiles p on p.id = s.user_id),
    'invitations', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.full_name, 'email', v.email, 'expires_at', v.expires_at) order by v.created_at desc), '[]'::jsonb)
                    from public.platform_invitations v where v.accepted_at is null and v.revoked_at is null and v.expires_at > now())
  );
end $$;

create or replace function public.platform_invite_staff(p_email text, p_full_name text, p_token_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform();
  if exists (select 1 from public.platform_invitations where email = lower(btrim(p_email)) and accepted_at is null and revoked_at is null and expires_at > now()) then
    raise exception 'Ya hay una invitación vigente para ese correo.' using errcode = '23505';
  end if;
  if exists (select 1 from public.platform_staff s join public.profiles p on p.id = s.user_id where lower(p.email) = lower(btrim(p_email))) then
    raise exception 'Esa persona ya es parte del equipo.' using errcode = '23505';
  end if;
  insert into public.platform_invitations (email, full_name, token_hash, expires_at, created_by)
    values (lower(btrim(p_email)), btrim(p_full_name), p_token_hash, now() + interval '7 days', (select auth.uid()));
end $$;

create or replace function public.platform_revoke_staff_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform();
  update public.platform_invitations set revoked_at = now() where id = p_id and accepted_at is null and revoked_at is null;
  if not found then raise exception 'La invitación ya no está vigente.' using errcode = 'P0002'; end if;
end $$;

-- Nadie se quita a sí mismo: así el equipo nunca queda vacío por error.
create or replace function public.platform_remove_staff(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform();
  if p_user = (select auth.uid()) then raise exception 'No puedes quitarte a ti mismo del equipo.' using errcode = '23514'; end if;
  delete from public.platform_staff where user_id = p_user;
  if not found then raise exception 'Esa persona no es parte del equipo.' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.platform_overview(), public.platform_institution(uuid), public.platform_create_institution(text, text, text, text, text, integer, text[], boolean),
  public.platform_update_institution(uuid, text, text, text, text, text), public.platform_set_status(uuid, text), public.platform_invite(uuid, text, text, text, text),
  public.platform_revoke_invitation(uuid), public.platform_team(), public.platform_invite_staff(text, text, text), public.platform_revoke_staff_invitation(uuid),
  public.platform_remove_staff(uuid) from public, anon;
grant execute on function public.platform_overview(), public.platform_institution(uuid), public.platform_create_institution(text, text, text, text, text, integer, text[], boolean),
  public.platform_update_institution(uuid, text, text, text, text, text), public.platform_set_status(uuid, text), public.platform_invite(uuid, text, text, text, text),
  public.platform_revoke_invitation(uuid), public.platform_team(), public.platform_invite_staff(text, text, text), public.platform_revoke_staff_invitation(uuid),
  public.platform_remove_staff(uuid) to authenticated;
