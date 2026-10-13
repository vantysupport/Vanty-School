-- 0001_core.sql — Instituciones, perfiles, pertenencias, invitaciones y auditoría.
-- Toda tabla operativa lleva institution_id: es la frontera de aislamiento entre colegios.

create extension if not exists pgcrypto with schema extensions;

-- Esquema no expuesto por la API: funciones auxiliares de RLS.
create schema if not exists app;

create type public.member_role as enum ('admin', 'directivo', 'docente', 'bienestar', 'apoderado', 'estudiante');
create type public.member_status as enum ('active', 'suspended', 'removed');

create or replace function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Instituciones ────────────────────────────────────────────────────────────
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  rbd text,                                   -- Rol Base de Datos (Mineduc), opcional
  dependency text not null default 'particular_subvencionado'
    check (dependency in ('municipal', 'slep', 'particular_subvencionado', 'particular_pagado')),
  commune text,
  region text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger institutions_updated before update on public.institutions
  for each row execute function app.set_updated_at();

create table public.institution_settings (
  institution_id uuid primary key references public.institutions(id) on delete cascade,
  grading_min numeric(2,1) not null default 1.0,
  grading_max numeric(2,1) not null default 7.0,
  grading_pass numeric(2,1) not null default 4.0,
  ai_enabled boolean not null default true,
  ai_daily_limit_per_user integer not null default 40 check (ai_daily_limit_per_user >= 0),
  invitation_ttl_days integer not null default 7 check (invitation_ttl_days between 1 and 30),
  urgent_protocol text,                       -- protocolo humano ante situaciones urgentes de bienestar
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger institution_settings_updated before update on public.institution_settings
  for each row execute function app.set_updated_at();

-- ── Perfiles (1:1 con auth.users) ───────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null default '',
  email text,
  phone text,
  birth_date date,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function app.set_updated_at();

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ── Pertenencia a una institución (aquí vive el rol) ─────────────────────────
create table public.institution_memberships (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.member_role not null,
  status public.member_status not null default 'active',
  is_managed boolean not null default false,  -- cuenta de menor de edad, gestionada por el colegio y su apoderado
  status_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, user_id)
);
create index memberships_user_idx on public.institution_memberships (user_id, status);
create index memberships_inst_role_idx on public.institution_memberships (institution_id, role, status);
create trigger memberships_updated before update on public.institution_memberships
  for each row execute function app.set_updated_at();

-- ── Invitaciones (se guarda solo el hash del token) ──────────────────────────
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  full_name text not null check (char_length(full_name) between 2 and 160),
  role public.member_role not null,
  token_hash text not null unique,
  is_managed boolean not null default false,
  birth_date date,
  course_id uuid,                             -- estudiante: curso en que se matricula al aceptar (FK en 0002)
  student_ids uuid[] not null default '{}',   -- apoderado: estudiantes que se vinculan al aceptar
  relationship text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index invitations_inst_idx on public.invitations (institution_id, created_at desc);

-- ── Auditoría (solo inserción; sin políticas de update/delete) ───────────────
create table public.audit_logs (
  id bigint generated always as identity primary key,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,                       -- p. ej. user.invite, grade.create, wellbeing.case.view
  entity text,
  entity_id text,
  sensitive boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_inst_idx on public.audit_logs (institution_id, created_at desc);

-- Solicitudes de eliminación de cuentas: las revisa una persona; nunca se ejecutan en cascada.
create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  requested_by uuid not null references public.profiles(id),
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'pending' check (status in ('pending', 'anonymized', 'rejected')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index deletion_requests_inst_idx on public.deletion_requests (institution_id, status);
