#!/usr/bin/env bash
set -euo pipefail

API_BASE=${API_BASE:-"http://localhost:3000"}
SECRET=${PIPELINE_SECRET:-""}
DRAFT_ID=${1:-""}

if [[ -z "$SECRET" ]]; then
  echo "PIPELINE_SECRET is required"
  exit 1
fi

if [[ -z "$DRAFT_ID" ]]; then
  echo "usage: validate_trace.sh <draft_id>"
  exit 1
fi

curl -sS "$API_BASE/api/drafts/$DRAFT_ID/synthesis-report" \
  -H "x-pipeline-secret: $SECRET" | jq .
