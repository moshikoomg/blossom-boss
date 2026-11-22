#!/usr/bin/env bash
# Builds a throwaway database from all migrations and runs the tenant-isolation test.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres tests/db/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${QA_DB:-blossom_qa}
psql -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/db/supabase-stub.sql >/dev/null
for f in supabase/migrations/*.sql; do
  # One old data migration references a legacy store row; create it first.
  case $f in *20260526053505*) $P -c "INSERT INTO stores(id,slug,name) VALUES('d720941e-6e5f-4a01-9402-4cd059164b39','legacy','legacy') ON CONFLICT DO NOTHING" ;; esac
  $P -1 -f "$f" >/dev/null
done
echo "migrations applied"
$P -f tests/db/tenant-isolation.sql
