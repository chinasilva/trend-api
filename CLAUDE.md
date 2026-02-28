# CLAUDE.md

This repository is a Next.js 16 + TypeScript trend aggregation service. It collects hot topics from multiple platforms, caches results in memory, stores snapshots in PostgreSQL via Prisma, and exposes REST APIs under `src/app/api/trends`.

## Core Commands

```bash
npm run dev          # local dev server
npm run build        # prisma generate + next build
npm run start        # run production build
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript check
npm run db:push      # sync Prisma schema
npm run db:studio    # inspect data
```

## Architecture

- `src/app/api/trends`: API routes (`route.ts`, `[platform]/route.ts`, `sync/route.ts`)
- `src/lib/scraper`: platform adapters (`tianapi`, `dailyhot`)
- `src/lib/db.ts`: persistence, deduplication, snapshot queries
- `src/lib/cache.ts`: per-platform in-memory cache (TTL)
- `prisma/schema.prisma`: `TrendSource`, `Trend`, `Content`, `Snapshot`

## Supported Platforms

`douyin`, `weibo`, `zhihu`, `baidu`, `weixin`, `bilibili`, `xiaohongshu`, `weixinvideo`

## Required Environment Variables

- `TIANAPI_KEY`
- `DATABASE_URL`

## GitHub Workflow

1. Create a feature branch: `git checkout -b feat/your-feature`.
2. Implement changes and run local functional checks.
3. At minimum run `npm run lint && npx tsc --noEmit`; if UI changed, include Playwright checks when available.
4. Fix issues, then commit with conventional prefix (`feat:`, `fix:`, `chore:`).
5. Push branch: `git push -u origin feat/your-feature`.
6. Create PR with `gh pr create`.
7. Address PR feedback and CI failures with follow-up commits.
8. Merge after approval, then sync local main.

Never push directly to `main`.
