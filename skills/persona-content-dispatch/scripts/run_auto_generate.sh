#!/usr/bin/env bash
set -euo pipefail

API_BASE=${API_BASE:-"http://localhost:3000"}
SECRET=${PIPELINE_SECRET:-""}
ACCOUNT_ID=${1:-""}

if [[ -z "$SECRET" ]]; then
  echo "PIPELINE_SECRET is required"
  exit 1
fi

if [[ -z "$ACCOUNT_ID" ]]; then
  echo "usage: run_auto_generate.sh <account_id>"
  exit 1
fi

curl -sS -X POST "$API_BASE/api/drafts/auto-generate" \
  -H "Content-Type: application/json" \
  -H "x-pipeline-secret: $SECRET" \
  -d "{\"accountId\":\"$ACCOUNT_ID\",\"triggerMode\":\"manual\"}" | jq .
