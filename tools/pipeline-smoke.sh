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

echo "== 1) compute realtime opportunities =="
COMPUTE_RESPONSE=$(curl -sS -X POST "$API_BASE/api/pipeline/opportunities/realtime/compute" \
  -H "Content-Type: application/json" \
  -H "x-pipeline-secret: $PIPELINE_SECRET" \
  -d "{\"accountId\":\"$ACCOUNT_ID\",\"topN\":50,\"refresh\":true}"
)
printf '%s\n' "$COMPUTE_RESPONSE" | jq .

SESSION_ID=$(printf '%s' "$COMPUTE_RESPONSE" | jq -r '.data.sessionId // empty')
if [[ -z "$SESSION_ID" ]]; then
  echo "realtime compute did not return sessionId"
  exit 1
fi

echo "== 2) generate realtime draft =="
GENERATE_RESPONSE=$(curl -sS -X POST "$API_BASE/api/pipeline/opportunities/realtime/generate" \
  -H "Content-Type: application/json" \
  -H "x-pipeline-secret: $PIPELINE_SECRET" \
  -d "{\"accountId\":\"$ACCOUNT_ID\",\"sessionId\":\"$SESSION_ID\"}"
)
printf '%s\n' "$GENERATE_RESPONSE" | jq .

DRAFT_ID=$(printf '%s' "$GENERATE_RESPONSE" | jq -r '.data.draft.draftId // empty')
if [[ -z "$DRAFT_ID" ]]; then
  echo "realtime generate did not return draftId"
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
