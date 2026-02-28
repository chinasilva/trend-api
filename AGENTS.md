# Repository Guidelines

## Project Structure & Module Organization
This project is a Next.js 16 App Router service for trend aggregation. Core code is in `src/`: `src/app/` (pages/API), `src/app/api/trends/` (`route.ts`, `[platform]/route.ts`, `sync/route.ts`), `src/lib/` (db/cache/scrapers), and `src/types/trend.ts`. Data models live in `prisma/schema.prisma`, and scheduling is in `.github/workflows/fetch-trends.yml`.

## Build, Test, and Development Commands
- `npm run dev`: start local development server at `http://localhost:3000`.
- `npm run build`: generate Prisma client and build production assets.
- `npm run start`: run the production build locally.
- `npm run lint`: run ESLint checks.
- `npm run db:push`: push Prisma schema changes to the database.
- `npm run db:migrate`: deploy migrations (for managed environments).
- `npm run db:studio`: open Prisma Studio for data inspection.

## Coding Style & Naming Conventions
Use TypeScript and App Router conventions throughout. Match existing style: 2-space indentation, semicolons, and single quotes in TS/TSX files. Use `camelCase` for variables/functions, `PascalCase` for React components (for example, `TrendList.tsx`), and lowercase platform identifiers (`douyin`, `weibo`, `xiaohongshu`). Run `npm run lint` before opening a PR.

## Testing Guidelines
There is currently no dedicated automated test framework committed in this repository. Minimum validation before PR:
- `npm run lint`
- `npx tsc --noEmit`
- Manual endpoint checks, for example:
  - `curl http://localhost:3000/api/trends`
  - `curl http://localhost:3000/api/trends/douyin`
  - `curl -X POST http://localhost:3000/api/trends/sync`
Run these checks before commit, and rerun before opening PR if additional commits are added.
When tests are added, prefer `*.test.ts` / `*.test.tsx` naming and keep tests close to the feature.

## Commit & Pull Request Guidelines
Follow the commit style used in history: `feat: ...`, `fix: ...`, `chore: ...` with concise summaries. Use feature branches (for example, `feat/snapshot-query`) and this sequence:
- for non-UI changes, at least run `npm run lint && npx tsc --noEmit`
- for UI changes, include Playwright checks when available
- commit locally, then push branch (`git push -u origin <branch>`), then create PR
- address PR feedback/CI results with follow-up commits before merge
PRs should include scope, linked issue (if any), verification steps, and sample API request/response or screenshots for behavior changes. Never push directly to `main`.

## Security & Configuration Tips
Never commit secrets from `.env.local` or deployment configs. Keep required keys (`TIANAPI_KEY`, `DATABASE_URL`) in environment variables and update `.env.example` when introducing new configuration.
