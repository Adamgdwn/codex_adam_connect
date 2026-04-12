-- Adam Connect RLS + helper triggers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_devices_updated_at on public.devices;
create trigger trg_devices_updated_at before update on public.devices
for each row execute function public.set_updated_at();

drop trigger if exists trg_trusted_folders_updated_at on public.trusted_folders;
create trigger trg_trusted_folders_updated_at before update on public.trusted_folders
for each row execute function public.set_updated_at();

drop trigger if exists trg_sessions_updated_at on public.sessions;
create trigger trg_sessions_updated_at before update on public.sessions
for each row execute function public.set_updated_at();

drop trigger if exists trg_approval_requests_updated_at on public.approval_requests;
create trigger trg_approval_requests_updated_at before update on public.approval_requests
for each row execute function public.set_updated_at();

drop trigger if exists trg_provider_connections_updated_at on public.provider_connections;
create trigger trg_provider_connections_updated_at before update on public.provider_connections
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.trusted_folders enable row level security;
alter table public.sessions enable row level security;
alter table public.approval_requests enable row level security;
alter table public.audit_logs enable row level security;
alter table public.provider_connections enable row level security;

drop policy if exists "profiles owner access" on public.profiles;
create policy "profiles owner access" on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "devices owner access" on public.devices;
create policy "devices owner access" on public.devices
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "trusted_folders owner access" on public.trusted_folders;
create policy "trusted_folders owner access" on public.trusted_folders
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "sessions owner access" on public.sessions;
create policy "sessions owner access" on public.sessions
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "approval_requests owner access" on public.approval_requests;
create policy "approval_requests owner access" on public.approval_requests
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "audit_logs owner read access" on public.audit_logs;
create policy "audit_logs owner read access" on public.audit_logs
for select
using (auth.uid() = owner_id);

drop policy if exists "audit_logs owner insert access" on public.audit_logs;
create policy "audit_logs owner insert access" on public.audit_logs
for insert
with check (auth.uid() = owner_id);

drop policy if exists "provider_connections owner access" on public.provider_connections;
create policy "provider_connections owner access" on public.provider_connections
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);
