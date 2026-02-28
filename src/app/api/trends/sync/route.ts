import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { saveTrends, saveSnapshot } from '@/lib/db';
import { PLATFORMS, type Platform } from '@/types/trend';

export const dynamic = 'force-dynamic';

// POST /api/trends/sync - 触发爬取并保存快照
export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'CRON_SECRET_NOT_CONFIGURED',
          message: 'CRON_SECRET is not configured.',
        },
        { status: 500 }
      );
    }

    const secret = request.headers.get('x-cron-secret');
    if (!secret || secret !== expectedSecret) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'UNAUTHORIZED',
          message: 'Unauthorized request.',
        },
        { status: 401 }
      );
    }

    const results: Array<{
      platform: Platform;
      fetchedCount: number;
      successCount: number;
      failCount: number;
      error?: string;
      dbError?: string;
      snapshotError?: string;
    }> = [];

    // 并行获取所有平台数据
    const promises = PLATFORMS.map(async (platform) => {
      try {
        // 先尝试从缓存获取
        let data = getCache(platform);

        if (!data) {
          // 缓存未命中，爬取数据
          const { fetchTrends } = await import('@/lib/scraper');
          data = await fetchTrends(platform);
          setCache(platform, data);
        }

        let trendSaveError: string | undefined;
        // 保存到旧的 Trend 表（带去重）
        try {
          await saveTrends(platform, data);
        } catch (error) {
          trendSaveError = error instanceof Error ? error.message : 'Failed to save trends';
          console.error(`Failed to save trends for ${platform}:`, trendSaveError);
        }

        // 保存快照（新功能）
        try {
          const snapshotResult = await saveSnapshot(platform, data);
          return {
            platform,
            fetchedCount: data.length,
            successCount: snapshotResult.successCount,
            failCount: snapshotResult.failCount,
            dbError: trendSaveError,
          };
        } catch (snapshotError) {
          const snapshotErrorMessage =
            snapshotError instanceof Error ? snapshotError.message : 'Failed to save snapshot';
          console.error(`Failed to save snapshot for ${platform}:`, snapshotErrorMessage);
          return {
            platform,
            fetchedCount: data.length,
            successCount: 0,
            failCount: data.length,
            dbError: trendSaveError,
            snapshotError: snapshotErrorMessage,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          platform,
          fetchedCount: 0,
          successCount: 0,
          failCount: 1,
          error: errorMessage,
        };
      }
    });

    const allResults = await Promise.all(promises);
    results.push(...allResults);

    // 统计成功/失败
    const totalFetched = results.reduce((sum, r) => sum + r.fetchedCount, 0);
    const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failCount, 0);
    const hasError = results.some((r) => r.error || r.dbError || r.snapshotError);

    return NextResponse.json({
      success: !hasError,
      message: hasError ? '部分平台爬取失败' : '数据爬取成功',
      data: {
        platforms: results,
        total: {
          fetchedCount: totalFetched,
          successCount: totalSuccess,
          failCount: totalFailed,
        },
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
