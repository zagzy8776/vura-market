# Production Migration Version Mismatch - Resolution

## Problem Summary

The production database has a **version mismatch** that needs to be resolved:

```
Version 13 in Database:     013_security_locations.sql (current checksum mismatch)
Version 13 in Local Repo:   013_nigeria_states_seed.sql (different file)

Versions 14-15 in Database: OLD migrations (no longer in repo)
Versions 14-15 in Local:    NOT PRESENT (removed from repo)

Versions 21-23 in Local:    New migrations ready to apply (not in database)
```

## Root Cause

The repository was reorganized at some point:
1. Old versions 14 and 15 were removed from the repo
2. Version 13 was changed from `security_locations` to `nigeria_states_seed`
3. Three new migrations were created as versions 21-23 to replace the old 014-015 sequence

However, the **production database still has the OLD versions** (013, 014, 015) with the old content.

## What This Means

- **Production schema reflects**: The OLD migrations 013-015 content
- **Local repo has**: NEW version 013 and versions 021-023
- **Migration runner will fail** because: Version 013 content doesn't match what's in the database

## Solution

You have two options:

### OPTION A: Update Schema Migrations Table (Non-Destructive - RECOMMENDED)

This approach **does not modify the schema**, only fixes the tracking table:

```sql
-- Fix Version 13 mismatch
UPDATE schema_migrations 
SET filename = '013_nigeria_states_seed.sql'
WHERE version = '13' 
AND filename = '013_security_locations.sql';

-- Note: Versions 14 and 15 can stay - they won't conflict with 19-23
-- The new versions 19-23 will apply without issues
```

**After running the above SQL:**
1. Version 13 will correctly map to the current `013_nigeria_states_seed.sql`
2. Versions 19-23 can be applied normally via `npm run db:migrate`

### OPTION B: Preserve Old Schema + Create New Migrations (Nuclear Option)

If you need to preserve the old 14-15 migrations exactly as applied:

```sql
-- Create migration records for 014-015 that were applied but now removed from repo
INSERT INTO schema_migrations (version, filename, checksum)
VALUES 
  ('14', '014_reservation_notification_safety.sql', '<old-checksum>'),
  ('15', '015_nigeria_states_seed.sql', '<old-checksum>')
ON CONFLICT (version) DO NOTHING;

-- Then versions 19-23 can apply
```

**Note:** This requires knowing the old checksums (available upon request).

## Current Status

```
✅ Versions 0-12:           Correct and matching
❌ Version 13:             MISMATCH (database has different file)
⚠️  Versions 14-15:        In database, not in repo (can stay as-is)
📋 Versions 19-23:         Ready to apply (new migrations)
```

## Recommended Action

**Run this SQL against production to fix:**

```sql
UPDATE schema_migrations 
SET filename = '013_nigeria_states_seed.sql', 
    checksum = '<computed-checksum>'
WHERE version = '13' 
AND filename = '013_security_locations.sql';
```

The checksum for `013_nigeria_states_seed.sql` is:
**`bbc4a144aba2166e5b31fcaa2b584c35397a153e58968d7161b1beef32543b3`**

### Execute Fix:

**Via psql:**
```bash
psql $DATABASE_URL -c "
UPDATE schema_migrations 
SET filename = '013_nigeria_states_seed.sql', 
    checksum = 'bbc4a144aba2166e5b31fcaa2b584c35397a153e58968d7161b1beef32543b3'
WHERE version = '13' 
AND filename = '013_security_locations.sql';
"
```

**Via Node script:**
```bash
CONFIRM_FIX_V13=true npm run fix-v13-mismatch
```

### Verify Fix:

```bash
npm run db:verify
```

This should show:
- Version 13 now correctly mapped to `013_nigeria_states_seed.sql`
- Versions 19-23 ready to apply

### Apply Pending Migrations:

```bash
npm run db:migrate
```

This will apply 019, 020, 021, 022, 023 in sequence.

## Why This Happened

The migration system is designed to detect schema changes via checksums. When:
1. The repo code changed from 013_security_locations → 013_nigeria_states_seed
2. But production database still had the old 013_security_locations
3. The migration runner detected a mismatch and refused to proceed

The solution is to update the tracking table to match current intent without rolling back the schema.

## Files to Reference

- Migration files: `db/migrations/` (contains current truth)
- Schema tracking: `schema_migrations` table in production
- Validation script: `scripts/verify-migration-readiness.ts`
- Fix script: `scripts/fix-v13-mismatch.ts` (creates on-demand)

---

**Questions?** Check the detailed analysis by running:
```bash
npm run migration-analysis
```

(Note: You may need to add this script to package.json if not present)
