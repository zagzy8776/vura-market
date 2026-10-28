# Vura scalable marketplace infrastructure

## The architecture: seven services, not seven separate writable databases

| Concern | Implementation | Reality |
|---|---|---|
| Transactional source of truth | Existing Neon PostgreSQL primary | Orders, stock, authentication, financial ledger and payouts must agree |
| Read capacity | Neon Postgres read replica, via DATABASE_READ_URL | Optional, only public eventual-consistency catalogue traffic |
| Caching | Upstash Redis REST | 20-second public marketplace list cache; never money, inventory or user data |
| Jobs | PostgreSQL transactional outbox + Fly worker | Seller notifications and reminders survive API restarts, retries and dead-letter |
| Media / object storage | Existing Cloudinary; private Cloudflare R2 backup bucket | Store public product images and encrypted offsite backups outside SQL |
| Edge protection | Cloudflare DNS, CDN, WAF | Configure in Cloudflare dashboard; bypass all private /api/ traffic |
| Recovery | Neon point-in-time restore + encrypted offsite PostgreSQL exports | Backup success requires a verified RESTORE, not just upload |

One writer keeps payment/order/stock relationships consistent. A 'million users' target doesn't justify six separately writable databases. Add replicas, partition large analytics tables, archive old events and upgrade compute when measurements justify it.

## Code shipped
- api/_lib/db.ts offers primary sql and optional publicReadSql. Only public listing GETs should read replicas.
- api/_lib/public-cache.ts uses server-only UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Caching is OFF until PUBLIC_CATALOG_CACHE_ENABLED=true is set. Redis failures fall back to Postgres. Cache only public discovery lists; item details and transactional checks use primary.
- db/migrations/036_commerce_outbox.sql creates a durable notification outbox with a trigger on buyer/seller request transitions. It also adds order/listing indexes.
- api/_lib/commerce-outbox.ts claims with FOR UPDATE SKIP LOCKED, retries and a dead-letter state. Scheduler creates 20-minute and 2-hour seller reminders and expires old requests.
- Existing Fly worker can deliver commerce jobs if COMMERCE_OUTBOX_ENABLED=true. Existing operations-jobs GitHub workflow calls the npm jobs:run script, which now exists.
- scripts/backup-postgres.sh encrypts a logical backup before uploading to private R2; it is MANUAL and requires pg_dump, aws cli, gpg and private credentials.
- npm run infra:check reports configuration presence without revealing credentials.

## Cloud settings (server only)
DATABASE_URL: Existing primary Postgres.
DATABASE_READ_URL: Optional Neon read replica URL. Replica may lag behind primary.
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN: Optional Redis connection.
PUBLIC_CATALOG_CACHE_ENABLED=true: Opt-in, after testing.
COMMERCE_OUTBOX_ENABLED=true: Opt-in only after migrations 034, 035, 036 and confirming the worker actually runs.
R2_ACCOUNT_ID, R2_BACKUP_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY: Private backup R2 credentials.
BACKUP_GPG_PASSPHRASE: Restore-critical backup secret, saved independently.
Existing Cloudinary configuration remains unchanged.

DO NOT add credentials to GitHub source or VITE_ variables. Use secret managers.

## Deployment and database safety
1. Verify actual database state and schema_migrations checksum history; DO NOT assume unrun migrations.
2. Create a pre-migration backup, confirm Neon PITR availability, then practice restoring a backup to an isolated database.
3. Test migrations 034, 035, 036 in order in a staging Neon branch.
4. Run validation, API/frontend typechecks, lint, unit tests and production build.
5. Test seller notification delivery/retry, expired requests, dead letter and pagination. Check a crash/restart test.
6. Configure private R2 bucket with no public domain and restricted keys, verify backup encryption and restore.
7. Create read replica only when needed. Don't use it for auth, reservations, payment or settlement.
8. Configure Cloudflare WAF, TLS and CDN for static assets only. Never cache /api, authenticated pages or payment webhooks.
9. Enable public Redis cache and queue only with monitoring and rollback in place.
10. Deploy production changes after explicit approval and migration review.

## Caveats
- This commit does not create Redis, Cloudflare, R2, or Neon replica resources, nor modify production data.
- The cache can show a public product listing for up to ~20 seconds after moderation; per-item detail always reads the primary.
- Notification delivery is at least once; external email/push can rarely repeat after worker restarts. Notification records are deduped.
- Cloudflare can serve static assets but is not a database.
- Neon backups/PITR retention and read-replica capacities depend on plan. Set test and production limits.
- The existing fly.toml has release_command 'npm run db:migrate'. Fly deployments could apply pending migrations automatically; review the connected DATABASE_URL and checksum history before redeployment.
- Future large-scale capacity: separate analytics and search workloads and introduce additional replicas. Sharding transactional finances demands specialized consistency design; do not do that ahead of actual load.
