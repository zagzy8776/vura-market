# Migration Recovery & Rollback Procedure

## Migration numbering

Migrations live in `db/migrations/` as `NNN_name.sql` with **strictly increasing,
unique** numbers. The numbering was corrected on 2026-08-25 because two pairs of
files shared duplicate numbers (`006`, `012`), which made
`npm run db:validate-migrations` fail and made application order ambiguous.

| Old filename                              | New filename                                |
| ----------------------------------------- | ------------------------------------------- |
| `006_reservation_notification_safety.sql` | `014_reservation_notification_safety.sql`   |
| `012_security_locations.sql`              | `013_security_locations.sql`                |
| `013_nigeria_states_seed.sql`             | `015_nigeria_states_seed.sql`               |

Dependency constraints that must be preserved going forward:

- `013_security_locations.sql` creates `nigeria_states` / `nigeria_lgas`;
  the Nigeria seed (`015_nigeria_states_seed.sql`) must always run after it.
- Never reuse or renumber an already-applied migration without following the
  recovery procedure below.

## Rules

1. **Never edit an applied migration.** `scripts/migrate.ts` records
   `(version, filename, sha256 checksum)` in `schema_migrations` and refuses to
   run when either changes.
2. New migrations always get the next unused number and must be wrapped in
   `BEGIN; ... COMMIT;` (enforced by `scripts/validate-migrations.ts`).
3. Validate before every run: `npm run db:validate-migrations`.
4. Apply with: `DATABASE_URL=... npm run db:migrate`.

## Recovery for databases that applied the OLD filenames

If staging/production ran the old duplicate-numbered files, `schema_migrations`
contains rows such as `('6','006_reservation_notification_safety.sql',...)`,
`('12','012_security_locations.sql',...)` and/or `('13','013_nigeria_states_seed.sql',...)`.
After the rename, the runner would see version/filename mismatches and abort.

All three renamed files are idempotent (CREATE TABLE IF NOT EXISTS,
CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION, ON CONFLICT upserts),
so they are safe to re-apply. Re-align the ledger once per affected database:

```sql
-- Run inside a transaction against the affected database:
BEGIN;
DELETE FROM schema_migrations WHERE version IN ('6','12','13')
  AND filename IN (
    '006_reservation_notification_safety.sql',
    '012_security_locations.sql',
    '013_nigeria_states_seed.sql'
  );
COMMIT;
```

Then run `DATABASE_URL=... npm run db:migrate`. It will re-apply
`013_security_locations`, `014_reservation_notification_safety` and
`015_nigeria_states_seed`; because every statement is idempotent this is a no-op
at the schema/data level and only refreshes the recorded versions/checksums.

## Rollback strategy

This project uses forward-only migrations (Neon/Postgres). There is no automatic
down-migration.

1. **Prevent**: every migration is a single transaction — a failure mid-file
   rolls itself back automatically and leaves no partial schema.
2. **Recover from a bad apply**: write a NEW numbered migration that reverses
   the change (`DROP`/`ALTER` as needed). Document why in the file header.
3. **Point-in-time recovery**: Neon branches support restore; create a branch
   from before the bad migration, verify, then re-point the environment.
4. **Verify after any recovery**:
   `npm run db:validate-migrations && DATABASE_URL=... npm run db:migrate`
   must both succeed, followed by the integration suite
   (`npm run integration`).
