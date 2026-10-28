/** Report only presence of infrastructure settings, never secrets or live state. */
const has = (k: string) => Boolean(process.env[k]?.trim());
const settings: Array<[string,boolean]> = [
  ['Primary Postgres',has('DATABASE_URL')],
  ['Public read replica',has('DATABASE_READ_URL')],
  ['Redis cache',has('UPSTASH_REDIS_REST_URL') && has('UPSTASH_REDIS_REST_TOKEN')],
  ['Redis cache enabled',process.env.PUBLIC_CATALOG_CACHE_ENABLED==='true'],
  ['Commerce outbox enabled',process.env.COMMERCE_OUTBOX_ENABLED==='true'],
  ['R2 private backup',has('R2_ACCOUNT_ID') && has('R2_BACKUP_BUCKET') && has('R2_ACCESS_KEY_ID') && has('R2_SECRET_ACCESS_KEY')],
  ['Offsite backup encryption',has('BACKUP_GPG_PASSPHRASE')],
];
for (const [label,yes] of settings) console.log((yes?'[configured] ':'[not configured] ') + label);
console.log('Credentials presence does not verify connectivity, backup recovery, or cloud provisioning.');
