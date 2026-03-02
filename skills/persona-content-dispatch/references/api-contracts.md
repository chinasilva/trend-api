# API Contracts

## Sync Opportunities
`POST /api/pipeline/opportunities/sync`

Body:
```json
{
  "windows": [
    { "label": "24h", "hours": 24, "weight": 0.65 },
    { "label": "3d", "hours": 72, "weight": 0.25 },
    { "label": "7d", "hours": 168, "weight": 0.10 }
  ]
}
```

## Auto Generate Draft
`POST /api/drafts/auto-generate`

Body:
```json
{
  "accountId": "<account_id>",
  "triggerMode": "manual"
}
```

## Draft Synthesis Report
`GET /api/drafts/:id/synthesis-report`

## Scheduled Run
`POST /api/pipeline/auto-generate/run`
