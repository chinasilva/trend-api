#!/usr/bin/env bash
set -euo pipefail

hook_name="manual"
run_staged_checks=0

while [[ $# -gt 0 ]]; do
  case "${1}" in
    --hook)
      hook_name="${2:-manual}"
      shift 2
      ;;
    --staged)
      run_staged_checks=1
      shift
      ;;
    *)
      shift
      ;;
  esac
done

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  echo "[workflow] not inside git repository." >&2
  exit 1
fi

cd "${repo_root}"

check_doc_front_matter() {
  local file="$1"
  local summary
  local read_when

  if [[ ! -f "${file}" ]]; then
    return 0
  fi

  if [[ "$(head -n 1 "${file}" 2>/dev/null)" != "---" ]]; then
    echo "[workflow] ${file}: missing front matter header (---)." >&2
    return 1
  fi

  summary="$(awk '
    BEGIN { in=0; found=0 }
    NR==1 && $0=="---" { in=1; next }
    in==1 && $0=="---" { exit }
    in==1 && $0 ~ /^summary:[[:space:]]*/ {
      value = substr($0, index($0, ":") + 1)
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      print value
      found=1
      exit
    }
    END { if (found==0) print "" }
  ' "${file}")"

  read_when="$(awk '
    BEGIN { in=0; found=0 }
    NR==1 && $0=="---" { in=1; next }
    in==1 && $0=="---" { exit }
    in==1 && $0 ~ /^read_when:[[:space:]]*/ {
      value = substr($0, index($0, ":") + 1)
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      print value
      found=1
      exit
    }
    END { if (found==0) print "" }
  ' "${file}")"

  if [[ -z "${summary}" ]]; then
    echo "[workflow] ${file}: missing or empty 'summary' in front matter." >&2
    return 1
  fi

  if [[ -z "${read_when}" ]]; then
    echo "[workflow] ${file}: missing or empty 'read_when' in front matter." >&2
    return 1
  fi

  return 0
}

run_docs_checks_on_staged() {
  local failed=0
  local has_docs=0
  local path

  while IFS= read -r -d '' path; do
    case "${path}" in
      docs/workflow/*.md|docs/spec-template.md|docs/weekly-workflow-review.md)
        has_docs=1
        if ! check_doc_front_matter "${path}"; then
          failed=1
        fi
        ;;
    esac
  done < <(git diff --cached --name-only --diff-filter=ACMR -z)

  if [[ "${has_docs}" -eq 1 ]]; then
    echo "[workflow] workflow docs front matter check finished."
  fi

  return "${failed}"
}

run_prisma_schema_guard_on_staged() {
  local schema_changed=0
  local migration_changed=0
  local path

  while IFS= read -r -d '' path; do
    case "${path}" in
      prisma/schema.prisma)
        schema_changed=1
        ;;
      prisma/migrations/*)
        migration_changed=1
        ;;
    esac
  done < <(git diff --cached --name-only --diff-filter=ACMR -z)

  if [[ "${schema_changed}" -eq 1 && "${migration_changed}" -eq 0 ]]; then
    if [[ "${ALLOW_SCHEMA_WITHOUT_MIGRATION:-0}" == "1" ]]; then
      echo "[workflow] prisma/schema.prisma changed without migration (allowed by ALLOW_SCHEMA_WITHOUT_MIGRATION=1)." >&2
      return 0
    fi

    cat >&2 <<'EOM'
[workflow] prisma/schema.prisma changed but no staged migration files were found.
[workflow] add a migration under prisma/migrations/* or set ALLOW_SCHEMA_WITHOUT_MIGRATION=1 for a one-off bypass.
EOM
    return 1
  fi

  return 0
}

if [[ "${hook_name}" == "pre-commit" || "${run_staged_checks}" -eq 1 ]]; then
  if ! run_docs_checks_on_staged || ! run_prisma_schema_guard_on_staged; then
    cat >&2 <<'EOM'
[workflow] commit blocked.
[workflow] fix the errors above, then retry commit.
EOM
    exit 1
  fi
fi

echo "[workflow] ${hook_name}: pass"
