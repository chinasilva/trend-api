# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Next.js 16** application that aggregates trending hot search data from multiple Chinese social media platforms. It fetches trends from external APIs, caches them in memory, stores them in PostgreSQL via Prisma, and serves them via REST API endpoints.

## Common Commands

```bash
npm run dev      # Start development server on http://localhost:3000
npm run build    # Build for production (runs prisma generate, then next build)
npm run start    # Start production server
npm run lint      # Run ESLint
```

The build process automatically runs `prisma generate` via the `postinstall` hook when dependencies are installed.

## Architecture

### API Layer (`src/app/api/`)
- `GET /api/trends` - Fetches all platforms' trending data in parallel
- `GET /api/trends/[platform]` - Fetches a specific platform's data (if needed)

### Scraper System (`src/lib/scraper/`)
Two data source adapters:
- **tianapi** - Uses tianapi.com API for: Douyin, Weibo, Zhihu, Baidu, Weixin, Bilibili
- **dailyhot** - Uses dailyhot API for: Xiaohongshu, Weixinvideo

Each scraper exports a `fetch{Platform}` function returning `TrendItem[]`.

### Database Layer (`src/lib/db.ts`)
- Uses **Prisma 7** with PostgreSQL
- Models: `TrendSource` (platform metadata), `Trend` (individual hot search items)
- Provides deduplication: same title+URL within a source updates existing record

### Caching (`src/lib/cache.ts`)
- In-memory Map with 5-minute TTL
- Per-platform cache, checked before scraping

### Frontend (`src/app/` and `src/components/`)
- Next.js App Router with React 19
- Tailwind CSS ## Supported Platforms

4 for styling

| Platform | Data Source |
|----------|-------------|
| douyin | tianapi |
| weibo | tianapi |
| zhihu | tianapi |
| baidu | tianapi |
| weixin | tianapi |
| bilibili | tianapi |
| xiaohongshu | dailyhot |
| weixinvideo | dailyhot |

## Environment Variables

- `TIANAPI_KEY` - Required for tianapi scrapers (configured in Vercel/project settings)
- Database connection via `DATABASE_URL` or Prisma 7 config in `prisma.config.ts`

## Type Definitions (`src/types/trend.ts`)

Core types: `Platform`, `TrendItem`, `TrendsResponse`, `AllTrendsResponse`, and `PLATFORM_CONFIGS` mapping platform to display name, icon, and data source.

## CI/CD

GitHub Actions workflow (`.github/workflows/fetch-trends.yml`) runs every 30 minutes to fetch all trends and persist them to the database.

## GitHub Workflow

All code changes must follow this workflow:
1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make code changes and verify they work correctly
3. Run `code-review-tester` agent or `npm run lint` && `npx tsc --noEmit` to check for issues
4. Fix any issues found by the tester
5. Commit changes on the feature branch: `git add . && git commit -m "description"`
6. Push the feature branch: `git push -u origin feat/your-feature`
7. Create a Pull Request using `gh pr create`
8. Merge the PR after review
9. Pull the latest main: `git checkout main && git pull`

**Important**: Never push directly to main branch. Always use PR workflow.
