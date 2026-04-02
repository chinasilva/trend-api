import { NextRequest, NextResponse } from 'next/server';
import {
  getTrendsFromDB,
  formatTrendsForAPI,
  getLatestSnapshot,
  getAllTrendsByDate,
  getTrendsByDate as getTrendsByDateFromDb,
  getTrendsBySnapshotAt,
} from '@/lib/db';
import { fetchAllTrends, fetchTrends } from '@/lib/scraper';
import { PLATFORMS, type Platform } from '@/types/trend';

export const dynamic = 'force-dynamic';
const GENERIC_FETCH_ERROR_MESSAGE = 'Failed to load trends. Please retry later.';
const DEFAULT_FALLBACK_PLATFORMS: Platform[] = ['weibo', 'weixin', 'weixinarticle'];
const FALLBACK_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_TRENDS_LIMIT = 50;
const MAX_TRENDS_LIMIT = 100;

const fallbackCache = new Map<string, {
  timestamp: number;
  data: Record<Platform, unknown[]>;
}>();

function errorResponse(status: number, errorCode: string, message: string) {
  return NextResponse.json(
    {
      success: false,
      errorCode,
      message,
      error: errorCode,
      data: {},
      hasData: false,
      snapshotAt: null,
      updatedAt: null,
      source: null,
    },
    { status }
  );
}

function parsePlatform(platform: string | null): Platform | null {
  if (!platform) {
    return null;
  }

  if (!PLATFORMS.includes(platform as Platform)) {
    return null;
  }

  return platform as Platform;
}

function shouldIncludeRichFields(searchParams: URLSearchParams) {
  return searchParams.get('view') === 'full';
}

function parseTrendLimit(searchParams: URLSearchParams) {
  const raw = searchParams.get('limit');
  if (!raw) {
    return DEFAULT_TRENDS_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_TRENDS_LIMIT;
  }

  return Math.min(parsed, MAX_TRENDS_LIMIT);
}

function getAllowedFallbackPlatforms() {
  const raw = process.env.TRENDS_DB_FALLBACK_PLATFORMS;
  if (!raw || !raw.trim()) {
    return DEFAULT_FALLBACK_PLATFORMS;
  }

  const allowed = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is Platform => PLATFORMS.includes(item as Platform));

  return allowed.length > 0 ? allowed : DEFAULT_FALLBACK_PLATFORMS;
}

function buildFallbackCacheKey(
  platforms: Platform[],
  includeRichFields: boolean,
  limitPerPlatform: number
) {
  return `${includeRichFields ? 'full' : 'slim'}:${limitPerPlatform}:${platforms.slice().sort().join(',')}`;
}

function getCachedFallbackData(key: string) {
  const cached = fallbackCache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp > FALLBACK_CACHE_TTL_MS) {
    fallbackCache.delete(key);
    return null;
  }

  return cached.data;
}

function setCachedFallbackData(key: string, data: Record<Platform, unknown[]>) {
  fallbackCache.set(key, {
    timestamp: Date.now(),
    data,
  });
}

async function loadDatabaseFallback(
  platforms: Platform[],
  includeRichFields: boolean,
  limitPerPlatform: number
) {
  const cacheKey = buildFallbackCacheKey(platforms, includeRichFields, limitPerPlatform);
  const cached = getCachedFallbackData(cacheKey);
  if (cached) {
    return cached;
  }

  const fallbackTrends = await getTrendsFromDB(platforms, {
    includeRichFields,
    limitPerPlatform,
  });
  const fallbackData = formatTrendsForAPI(fallbackTrends, {
    includeRichFields,
  }) as Record<Platform, unknown[]>;
  setCachedFallbackData(cacheKey, fallbackData);
  return fallbackData;
}

function limitTrendsPayload(
  payload: Record<Platform, unknown[]>,
  limitPerPlatform: number
) {
  const limited = {} as Record<Platform, unknown[]>;

  for (const platform of PLATFORMS) {
    const items = payload[platform];
    limited[platform] = Array.isArray(items) ? items.slice(0, limitPerPlatform) : [];
  }

  return limited;
}

function applyResponseHeaders(response: NextResponse, source: string) {
  const cacheControl = source === 'timeline' || source === 'history'
    ? 'public, s-maxage=300, stale-while-revalidate=3600'
    : 'public, s-maxage=60, stale-while-revalidate=240';
  response.headers.set('Cache-Control', cacheControl);
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const snapshotAtParam = searchParams.get('snapshotAt');
    const platform = parsePlatform(searchParams.get('platform'));
    const includeRichFields = shouldIncludeRichFields(searchParams);
    const limitPerPlatform = parseTrendLimit(searchParams);
    const allowedFallbackPlatforms = new Set(getAllowedFallbackPlatforms());

    let data: Record<Platform, unknown[]>;
    let snapshotAt: string | null;
    let source: string;

    if (searchParams.get('platform') && !platform) {
      return errorResponse(400, 'INVALID_PLATFORM', 'Invalid platform parameter.');
    }

    if (snapshotAtParam) {
      const parsedSnapshotAt = new Date(snapshotAtParam);
      if (isNaN(parsedSnapshotAt.getTime())) {
        return errorResponse(
          400,
          'INVALID_SNAPSHOT_AT',
          'Invalid snapshotAt format. Use ISO datetime like 2026-02-28T06:30:00.000Z'
        );
      }

      const snapshotResult = await getTrendsBySnapshotAt(
        parsedSnapshotAt,
        platform || undefined,
        { includeRichFields, limitPerPlatform }
      );
      data = snapshotResult.trends as Record<Platform, unknown[]>;
      snapshotAt = snapshotResult.snapshotAt;
      source = 'timeline';
    } else if (dateParam) {
      // 解析日期参数
      const date = new Date(dateParam);
      if (isNaN(date.getTime())) {
        return errorResponse(
          400,
          'INVALID_DATE',
          'Invalid date format. Use ISO format like 2026-02-27'
        );
      }

      // 查询指定日期的数据
      if (platform) {
        const trends = await getTrendsByDateFromDb(platform, date, {
          includeRichFields,
          limitPerPlatform,
        });
        data = { [platform]: trends } as Record<Platform, unknown[]>;
        snapshotAt = date.toISOString();
      } else {
        const result = await getAllTrendsByDate(date, {
          includeRichFields,
          limitPerPlatform,
        });
        data = result.trends as Record<Platform, unknown[]>;
        snapshotAt = result.snapshotAt;
      }
      source = 'history';
    } else {
      // 无日期参数，返回最新数据（优先从快照表获取）
      let snapshotResult = { trends: {}, snapshotAt: null as string | null };
      let hasSnapshotReadError = false;

      try {
        snapshotResult = await getLatestSnapshot(platform || undefined, {
          includeRichFields,
          limitPerPlatform,
        });
      } catch (error) {
        hasSnapshotReadError = true;
        console.error('[GET /api/trends] failed to read snapshots:', error);
      }

      if (snapshotResult.snapshotAt && Object.keys(snapshotResult.trends).length > 0) {
        data = snapshotResult.trends as Record<Platform, unknown[]>;
        snapshotAt = snapshotResult.snapshotAt;
        source = 'snapshot';

        // 快照通常是按批次写入，若某些平台当次同步失败，尝试用 Trend 表兜底补齐缺失平台。
        if (!platform) {
          const missingPlatforms = PLATFORMS.filter((p) => (data[p]?.length ?? 0) === 0);
          const eligibleFallbackPlatforms = missingPlatforms.filter((item) =>
            allowedFallbackPlatforms.has(item)
          );

          if (eligibleFallbackPlatforms.length > 0) {
            const fallbackData = await loadDatabaseFallback(
              eligibleFallbackPlatforms,
              includeRichFields,
              limitPerPlatform
            );
            let filledCount = 0;

            for (const p of eligibleFallbackPlatforms) {
              if ((fallbackData[p]?.length ?? 0) > 0) {
                data[p] = fallbackData[p];
                filledCount += 1;
              }
            }

            if (filledCount > 0) {
              source = 'snapshot+database';
            }
          }
        }
      } else {
        // 降级到旧的 Trend 表
        const trends = await getTrendsFromDB(platform || undefined, {
          includeRichFields,
          limitPerPlatform,
        });
        data = formatTrendsForAPI(trends, { includeRichFields });
        snapshotAt = trends.length > 0
          ? trends.reduce((latest, t) =>
              t.updatedAt > latest ? t.updatedAt : latest,
            trends[0].updatedAt
          ).toISOString()
          : new Date().toISOString();
        source = hasSnapshotReadError ? 'database-fallback' : 'database';
      }
    }

    // 检查是否有数据
    const hasData = PLATFORMS.some(p => data[p]?.length > 0);

    const response = NextResponse.json({
      success: true,
      data,
      snapshotAt,
      updatedAt: snapshotAt,
      source,
      hasData,
    });

    return applyResponseHeaders(response, source);
  } catch (error) {
    console.error('[GET /api/trends] failed:', error);
    try {
      const fallbackPlatform = parsePlatform(new URL(request.url).searchParams.get('platform'));
      const limitPerPlatform = parseTrendLimit(new URL(request.url).searchParams);
      const fallbackData = fallbackPlatform
        ? ({ [fallbackPlatform]: (await fetchTrends(fallbackPlatform)).slice(0, limitPerPlatform) } as Record<Platform, unknown[]>)
        : limitTrendsPayload(await fetchAllTrends(), limitPerPlatform);
      const hasData = PLATFORMS.some((p) => fallbackData[p]?.length > 0);

      if (hasData) {
        const now = new Date().toISOString();
        const response = NextResponse.json({
          success: true,
          data: fallbackData,
          snapshotAt: now,
          updatedAt: now,
          source: 'live-fallback',
          hasData: true,
        });
        return applyResponseHeaders(response, 'live-fallback');
      }
    } catch (fallbackError) {
      console.error('[GET /api/trends] live fallback failed:', fallbackError);
    }

    return errorResponse(500, 'TRENDS_FETCH_FAILED', GENERIC_FETCH_ERROR_MESSAGE);
  }
}
