#!/usr/bin/env bash
set -euo pipefail

API_BASE=${API_BASE:-"http://localhost:3000"}
PIPELINE_SECRET=${PIPELINE_SECRET:-""}
PIPELINE_SYNC_SECRET=${PIPELINE_SYNC_SECRET:-"$PIPELINE_SECRET"}
ACCOUNT_ID=${1:-""}

if [[ -z "$PIPELINE_SECRET" ]]; then
  echo "PIPELINE_SECRET is required"
  exit 1
fi

if [[ -z "$ACCOUNT_ID" ]]; then
  echo "usage: tools/pipeline-smoke.sh <account_id>"
  exit 1
fi

echo "== 1) sync opportunities (24h/3d/7d) =="
SYNC_RESPONSE=$(curl -sS -X POST "$API_BASE/api/pipeline/opportunities/sync" \
  -H "Content-Type: application/json" \
  -H "x-pipeline-secret: $PIPELINE_SYNC_SECRET" \
  -d '{"windows":[{"label":"24h","hours":24,"weight":0.65},{"label":"3d","hours":72,"weight":0.25},{"label":"7d","hours":168,"weight":0.10}]}'
)
printf '%s\n' "$SYNC_RESPONSE" | jq .

echo "== 2) auto-generate draft =="
AUTO_RESPONSE=$(curl -sS -X POST "$API_BASE/api/drafts/auto-generate" \
  -H "Content-Type: application/json" \
  -H "x-pipeline-secret: $PIPELINE_SECRET" \
  -d "{\"accountId\":\"$ACCOUNT_ID\",\"triggerMode\":\"manual\"}"
)
printf '%s\n' "$AUTO_RESPONSE" | jq .

DRAFT_ID=$(printf '%s' "$AUTO_RESPONSE" | jq -r '.data.draftId // empty')
if [[ -z "$DRAFT_ID" ]]; then
  echo "auto-generate did not return draftId"
  exit 1
fi

echo "== 3) synthesis report =="
REPORT_RESPONSE=$(curl -sS "$API_BASE/api/drafts/$DRAFT_ID/synthesis-report" \
  -H "x-pipeline-secret: $PIPELINE_SECRET")
printf '%s\n' "$REPORT_RESPONSE" | jq .

echo "== 4) scheduled runner endpoint =="
RUN_RESPONSE=$(curl -sS -X POST "$API_BASE/api/pipeline/auto-generate/run" \
  -H "x-pipeline-secret: $PIPELINE_SYNC_SECRET")
printf '%s\n' "$RUN_RESPONSE" | jq .

echo "smoke check completed"
