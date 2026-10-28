#!/usr/bin/env bash
# Manual only. Encrypt before uploading offsite. Does not create buckets.
set -euo pipefail
for tool in pg_dump aws gpg mktemp; do
  command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }
done
for key in DATABASE_URL R2_ACCOUNT_ID R2_BACKUP_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY BACKUP_GPG_PASSPHRASE; do
  [[ -n "${!key:-}" ]] || { echo "Missing configuration: $key" >&2; exit 1; }
done
[[ "$R2_ACCOUNT_ID" =~ ^[[:alnum:]]+$ ]] || { echo "Invalid account ID" >&2; exit 1; }
[[ "$R2_BACKUP_BUCKET" =~ ^[a-z0-9.-]+$ ]] || { echo "Invalid bucket" >&2; exit 1; }
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
file="vura-db-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL" --file="$tmp/database.dump"
printf '%s' "$BACKUP_GPG_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback \
  --passphrase-fd 0 --symmetric --cipher-algo AES256 \
  --output "$tmp/$file" "$tmp/database.dump"
rm -f "$tmp/database.dump"
aws --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  s3 cp "$tmp/$file" "s3://${R2_BACKUP_BUCKET}/postgres/$file" --only-show-errors
echo "Encrypted private backup uploaded: postgres/$file"
echo "Restore separately in an isolated database to verify this backup."
