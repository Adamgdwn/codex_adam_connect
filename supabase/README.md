# Supabase Control Plane

This folder contains schema proposals and migrations for Adam Connect's owner-scoped control plane.

## Owner-Scoped Tables

All primary tables are scoped by `owner_id` and protected with RLS:

- `profiles`
- `devices`
- `trusted_folders`
- `sessions`
- `approval_requests`
- `audit_logs`
- `provider_connections`
- `device_presence`
- `wake_requests`
- `wake_results`

## Realtime Channel Mapping

Suggested logical channels (all filtered by `owner_id`):

- `owner:{ownerId}:devices`
  - table events: `devices`, `device_presence`
  - event model: `machine_online`, `machine_offline`

- `owner:{ownerId}:sessions`
  - table events: `sessions`
  - event model: `session_started`, `session_paused`, `session_ended`

- `owner:{ownerId}:approvals`
  - table events: `approval_requests`
  - event model: `approval_requested`, `approval_resolved`

- `owner:{ownerId}:wake`
  - table events: `wake_requests`, `wake_results`
  - event model: `wake_requested`, `wake_result`

- `owner:{ownerId}:audit`
  - table events: `audit_logs`
  - event model: append-only audit stream

## Migration Order

1. `202603090001_initial_schema.sql`
2. `202603090002_rls_and_triggers.sql`
3. `202603090003_presence_and_wake.sql`

## Notes

- Source code content should not be stored in this database.
- Keep records metadata-first and event-centric.
- All privileged-action decisions should be represented in `approval_requests` and mirrored in `audit_logs`.
