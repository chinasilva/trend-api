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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const snapshotAtParam = searchParams.get('snapshotAt');
    const platform = parsePlatform(searchParams.get('platform'));

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

      const snapshotResult = await getTrendsBySnapshotAt(parsedSnapshotAt, platform || undefined);
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
        const trends = await getTrendsByDateFromDb(platform, date);
        data = { [platform]: trends } as Record<Platform, unknown[]>;
        snapshotAt = date.toISOString();
      } else {
        const result = await getAllTrendsByDate(date);
        data = result.trends as Record<Platform, unknown[]>;
        snapshotAt = result.snapshotAt;
      }
      source = 'history';
    } else {
      // 无日期参数，返回最新数据（优先从快照表获取）
      let snapshotResult = { trends: {}, snapshotAt: null as string | null };
      let hasSnapshotReadError = false;

      try {
        snapshotResult = await getLatestSnapshot(platform || undefined);
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
          if (missingPlatforms.length > 0) {
            const fallbackTrends = await getTrendsFromDB();
            const fallbackData = formatTrendsForAPI(fallbackTrends) as Record<Platform, unknown[]>;
            let filledCount = 0;

            for (const p of missingPlatforms) {
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
        const trends = await getTrendsFromDB(platform || undefined);
        data = formatTrendsForAPI(trends);
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

    return NextResponse.json({
      success: true,
      data,
      snapshotAt,
      updatedAt: snapshotAt,
      source,
      hasData,
    });
  } catch (error) {
    console.error('[GET /api/trends] failed:', error);
    try {
      const fallbackPlatform = parsePlatform(new URL(request.url).searchParams.get('platform'));
      const fallbackData = fallbackPlatform
        ? ({ [fallbackPlatform]: await fetchTrends(fallbackPlatform) } as Record<Platform, unknown[]>)
        : await fetchAllTrends();
      const hasData = PLATFORMS.some((p) => fallbackData[p]?.length > 0);

      if (hasData) {
        const now = new Date().toISOString();
        return NextResponse.json({
          success: true,
          data: fallbackData,
          snapshotAt: now,
          updatedAt: now,
          source: 'live-fallback',
          hasData: true,
        });
      }
    } catch (fallbackError) {
      console.error('[GET /api/trends] live fallback failed:', fallbackError);
    }

    return errorResponse(500, 'TRENDS_FETCH_FAILED', GENERIC_FETCH_ERROR_MESSAGE);
  }
}
