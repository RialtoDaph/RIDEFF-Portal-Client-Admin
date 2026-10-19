#!/usr/bin/env bash
# Runs migrations, seed and RLS tests against a throwaway local Postgres.
# Usage: scripts/db/test-local.sh   (needs initdb/pg_ctl on PATH or in /usr/lib/postgresql/*/bin)
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN=$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")
DIR=$(mktemp -d)
PORT=${PORT:-54329}
cleanup() { "$PGBIN/pg_ctl" -D "$DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
RUN=(); [ "$(id -u)" = 0 ] && { chown postgres "$DIR"; RUN=(runuser -u postgres --); }
"${RUN[@]}" "$PGBIN/initdb" -D "$DIR" -A trust -U postgres >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k /tmp" -l "$DIR/log" start >/dev/null
P=(psql -h /tmp -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X -o /dev/null)
"${P[@]}" -c "create database portal" >/dev/null
P+=(-d portal)
"${P[@]}" -f scripts/db/auth-stub.sql
for f in supabase/migrations/*.sql; do "${P[@]}" -f "$f"; done
"${P[@]}" -f supabase/seed.sql
for f in supabase/tests/*.sql; do echo "▶ $f"; "${P[@]}" -f "$f"; done
echo "✓ all database tests passed"
