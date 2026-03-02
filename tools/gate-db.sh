#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${repo_root}"

UNREACHABLE_EXIT_CODE=42

fail() {
  echo "[gate-db] $1" >&2
  exit 1
}

fail_unreachable() {
  echo "[gate-db] GATE_DB_UNREACHABLE: $1" >&2
  exit "${UNREACHABLE_EXIT_CODE}"
}

is_unreachable_output() {
  local text="${1:-}"
  printf '%s' "${text}" | grep -Eqi \
    'P1001|can.t reach database server|connection refused|ECONNREFUSED|ENOTFOUND|timed out|ETIMEDOUT|could not connect'
}

resolve_url() {
  node - "$@" <<'NODE'
const fs = require('fs');
const path = require('path');

const keys = process.argv.slice(2);

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[match[1]] = value;
  }

  return out;
}

const merged = {
  ...parseEnvFile(path.join(process.cwd(), '.env')),
  ...parseEnvFile(path.join(process.cwd(), '.env.local')),
  ...process.env,
};

for (const key of keys) {
  const value = merged[key];
  if (typeof value === 'string' && value.trim()) {
    process.stdout.write(value.trim());
    process.exit(0);
  }
}
NODE
}

resolve_non_pooling_url() {
  resolve_url TREND_API_POSTGRES_URL_NON_POOLING POSTGRES_URL_NON_POOLING
}

echo "[gate-db] start"

base_ref="${GATE_DB_BASE_REF:-origin/main}"
diff_range=""
if git rev-parse --verify "${base_ref}" >/dev/null 2>&1; then
  diff_range="${base_ref}...HEAD"
elif git rev-parse --verify "HEAD~1" >/dev/null 2>&1; then
  diff_range="HEAD~1...HEAD"
fi

changed_files=""
if [[ -n "${diff_range}" ]]; then
  changed_files="$(git diff --name-only "${diff_range}")"
else
  changed_files="$(git diff --name-only)"
fi

schema_changed=0
migration_changed=0

if printf '%s\n' "${changed_files}" | grep -Eq '^prisma/schema\.prisma$'; then
  schema_changed=1
fi

if printf '%s\n' "${changed_files}" | grep -Eq '^prisma/migrations/'; then
  migration_changed=1
fi

if [[ "${schema_changed}" -eq 1 && "${migration_changed}" -eq 0 ]]; then
  if [[ "${ALLOW_SCHEMA_WITHOUT_MIGRATION:-0}" == "1" ]]; then
    echo "[gate-db] schema changed without migration (allowed by ALLOW_SCHEMA_WITHOUT_MIGRATION=1)."
  else
    fail "prisma/schema.prisma changed without prisma/migrations changes in ${diff_range:-working tree}."
  fi
fi

non_pooling_url="$(resolve_non_pooling_url)"
runtime_url="$(resolve_url TREND_API_POSTGRES_URL POSTGRES_URL DATABASE_URL)"

run_migrate_status() {
  local label="$1"
  local url="$2"
  local output
  if [[ -z "${url}" ]]; then
    return 1
  fi

  echo "[gate-db] running prisma migrate status (${label})"
  export TREND_API_POSTGRES_URL="${url}"
  if output="$(npx prisma migrate status 2>&1)"; then
    printf '%s\n' "${output}"
    return 0
  fi

  printf '%s\n' "${output}" >&2
  if is_unreachable_output "${output}"; then
    return "${UNREACHABLE_EXIT_CODE}"
  fi

  return 1
}

if [[ -n "${non_pooling_url}" ]]; then
  if run_migrate_status "non-pooling" "${non_pooling_url}"; then
    :
  else
    rc=$?
    if [[ "${rc}" -eq "${UNREACHABLE_EXIT_CODE}" ]]; then
      echo "[gate-db] non-pooling migrate status unreachable; trying runtime URL." >&2
    else
      echo "[gate-db] non-pooling migrate status failed; trying runtime URL." >&2
    fi

    if [[ "${runtime_url}" == "${non_pooling_url}" || -z "${runtime_url}" ]]; then
      if [[ "${rc}" -eq "${UNREACHABLE_EXIT_CODE}" ]]; then
        fail_unreachable "cannot complete prisma migrate status on non-pooling target."
      fi
      fail "cannot complete prisma migrate status."
    fi

    if run_migrate_status "runtime" "${runtime_url}"; then
      :
    else
      rc=$?
      if [[ "${rc}" -eq "${UNREACHABLE_EXIT_CODE}" ]]; then
        fail_unreachable "cannot complete prisma migrate status on both non-pooling and runtime targets."
      fi
      fail "cannot complete prisma migrate status."
    fi
  fi
else
  if run_migrate_status "runtime" "${runtime_url}"; then
    :
  else
    rc=$?
    if [[ "${rc}" -eq "${UNREACHABLE_EXIT_CODE}" ]]; then
      fail_unreachable "cannot complete prisma migrate status on runtime target."
    fi
    fail "cannot complete prisma migrate status."
  fi
fi

echo "[gate-db] checking runtime/non-pooling target alignment"
target_json="$(tools/diag-db-target.sh --json)"
node -e '
const payload = JSON.parse(process.argv[1]);
const runtime = payload.runtime;
const nonPooling = payload.nonPooling;

if (!runtime || !runtime.target) {
  console.error("[gate-db] runtime DB URL is missing or invalid.");
  process.exit(1);
}

if (nonPooling && nonPooling.target) {
  const a = runtime.target;
  const b = nonPooling.target;
  const same = a.host === b.host && a.database === b.database;
  if (!same) {
    console.error(`[gate-db] runtime (${a.host}/${a.database}) and non-pooling (${b.host}/${b.database}) targets are not aligned.`);
    process.exit(1);
  }
}
' "${target_json}"

echo "[gate-db] checking required tables and columns"
if ! db_check_output="$(
  npx prisma db execute --stdin 2>&1 <<'SQL'
DO $$
BEGIN
  IF to_regclass('"public"."Account"') IS NULL THEN
    RAISE EXCEPTION 'missing table: Account';
  END IF;

  IF to_regclass('"public"."TopicSynthesisReport"') IS NULL THEN
    RAISE EXCEPTION 'missing table: TopicSynthesisReport';
  END IF;

  IF to_regclass('"public"."TopicResearch"') IS NULL THEN
    RAISE EXCEPTION 'missing table: TopicResearch';
  END IF;

  IF to_regclass('"public"."AutoGenerateJob"') IS NULL THEN
    RAISE EXCEPTION 'missing table: AutoGenerateJob';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Account' AND column_name = 'autoGenerateEnabled'
  ) THEN
    RAISE EXCEPTION 'missing column: Account.autoGenerateEnabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Account' AND column_name = 'autoGenerateTime'
  ) THEN
    RAISE EXCEPTION 'missing column: Account.autoGenerateTime';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Account' AND column_name = 'autoGenerateLeadMinutes'
  ) THEN
    RAISE EXCEPTION 'missing column: Account.autoGenerateLeadMinutes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Account' AND column_name = 'autoGenerateTimezone'
  ) THEN
    RAISE EXCEPTION 'missing column: Account.autoGenerateTimezone';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Account' AND column_name = 'lastAutoGenerateAt'
  ) THEN
    RAISE EXCEPTION 'missing column: Account.lastAutoGenerateAt';
  END IF;
END $$;
SQL
 )"; then
  printf '%s\n' "${db_check_output}" >&2
  if is_unreachable_output "${db_check_output}"; then
    fail_unreachable "cannot run required table/column checks."
  fi
  fail "required table/column checks failed."
fi

printf '%s\n' "${db_check_output}"
echo "[gate-db] pass"
