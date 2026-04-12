# RLS Notes

## Model

Adam Connect uses a strict single-owner model:

- Every row tied to mutable platform state includes `owner_id`.
- Policies enforce `auth.uid() = owner_id` for read/write paths.
- `profiles` uses `auth.uid() = id`.

## Policy Pattern

For owner-scoped tables:

```sql
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id)
```

For append-only audit:

- `select` policy restricted to owner.
- `insert` policy restricted to owner.
- No update/delete policies by default.

## Realtime Safety

- Realtime subscribers must always filter by `owner_id`.
- Never expose broad channels without owner filter predicates.
- Avoid client-side fanout logic that merges owners on the same channel.

## Future Hardening

- Add service-role-only write paths for sensitive state transitions.
- Add event signatures or hash chains for tamper-evident audit history.
- Add explicit anti-replay constraints for approval resolution payloads.
