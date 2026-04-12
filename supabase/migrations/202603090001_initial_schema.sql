-- Adam Connect initial schema
-- Single-owner secure remote development control platform

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  machine_label text not null,
  platform text not null check (platform in ('windows', 'macos', 'linux', 'android', 'ios')),
  role text not null check (role in ('developer_machine', 'mobile_controller')),
  wake_capability text not null check (wake_capability in ('supported', 'unsupported', 'unavailable', 'degraded')),
  is_online boolean not null default false,
  public_key text,
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trusted_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  absolute_path text not null,
  display_name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (device_id, absolute_path)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  trusted_folder_id uuid references public.trusted_folders(id) on delete set null,
  workspace_path text not null,
  status text not null check (status in ('pending', 'active', 'paused', 'ended', 'error')),
  started_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  requester_device_id uuid not null references public.devices(id) on delete cascade,
  action_type text not null check (action_type in ('run_privileged_command', 'open_untrusted_folder', 'provider_operation', 'wake_machine')),
  action_summary text not null,
  status text not null check (status in ('pending', 'approved', 'denied', 'expired')),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  resolver_device_id uuid references public.devices(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider_kind text not null check (provider_kind in ('github', 'vercel', 'supabase', 'stripe')),
  status text not null check (status in ('connected', 'disconnected', 'error')),
  external_account_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, provider_kind)
);

create index if not exists idx_devices_owner_id on public.devices(owner_id);
create index if not exists idx_trusted_folders_owner_id on public.trusted_folders(owner_id);
create index if not exists idx_sessions_owner_id on public.sessions(owner_id);
create index if not exists idx_sessions_device_id on public.sessions(device_id);
create index if not exists idx_approval_requests_owner_id on public.approval_requests(owner_id);
create index if not exists idx_approval_requests_status on public.approval_requests(status);
create index if not exists idx_audit_logs_owner_id on public.audit_logs(owner_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_provider_connections_owner_id on public.provider_connections(owner_id);
