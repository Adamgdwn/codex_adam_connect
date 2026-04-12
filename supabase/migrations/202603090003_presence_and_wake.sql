-- Device presence + wake flow records

create table if not exists public.device_presence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  online boolean not null,
  source text not null check (source in ('companion', 'extension', 'mobile')),
  observed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wake_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  requester_device_id uuid not null references public.devices(id) on delete cascade,
  target_device_id uuid not null references public.devices(id) on delete cascade,
  reason text not null,
  requested_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wake_results (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  wake_request_id uuid not null references public.wake_requests(id) on delete cascade,
  target_device_id uuid not null references public.devices(id) on delete cascade,
  success boolean not null,
  detail text,
  completed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_device_presence_owner_id on public.device_presence(owner_id);
create index if not exists idx_device_presence_observed_at on public.device_presence(observed_at desc);
create index if not exists idx_wake_requests_owner_id on public.wake_requests(owner_id);
create index if not exists idx_wake_results_owner_id on public.wake_results(owner_id);

alter table public.device_presence enable row level security;
alter table public.wake_requests enable row level security;
alter table public.wake_results enable row level security;

drop policy if exists "device_presence owner access" on public.device_presence;
create policy "device_presence owner access" on public.device_presence
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "wake_requests owner access" on public.wake_requests;
create policy "wake_requests owner access" on public.wake_requests
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "wake_results owner access" on public.wake_results;
create policy "wake_results owner access" on public.wake_results
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);
