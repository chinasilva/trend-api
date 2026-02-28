import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { saveTrends, saveSnapshot } from '@/lib/db';
import { PLATFORMS, type Platform } from '@/types/trend';

export const dynamic = 'force-dynamic';

// POST /api/trends/sync - 触发爬取并保存快照
export async function POST() {
  try {
    const results: Array<{
      platform: Platform;
      successCount: number;
      failCount: number;
      error?: string;
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

        // 保存到旧的 Trend 表（带去重）
        try {
          await saveTrends(platform, data);
        } catch (dbError) {
          console.error(`Failed to save trends for ${platform}:`, dbError);
        }

        // 保存快照（新功能）
        try {
          const snapshotResult = await saveSnapshot(platform, data);
          return {
            platform,
            successCount: snapshotResult.successCount,
            failCount: snapshotResult.failCount,
          };
        } catch (snapshotError) {
          console.error(`Failed to save snapshot for ${platform}:`, snapshotError);
          return {
            platform,
            successCount: data.length,
            failCount: 0,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          platform,
          successCount: 0,
          failCount: PLATFORMS.length,
          error: errorMessage,
        };
      }
    });

    const allResults = await Promise.all(promises);
    results.push(...allResults);

    // 统计成功/失败
    const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failCount, 0);
    const hasError = results.some(r => r.error);

    return NextResponse.json({
      success: !hasError,
      message: hasError ? '部分平台爬取失败' : '数据爬取成功',
      data: {
        platforms: results,
        total: {
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
