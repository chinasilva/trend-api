import { NextResponse } from 'next/server';
import { fetchAllTrends } from '@/lib/scraper';
import { saveSnapshot } from '@/lib/db';
import { PLATFORMS } from '@/types/trend';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // 爬取所有平台数据
    const allTrends = await fetchAllTrends();

    // 为每个平台保存快照
    const results = await Promise.allSettled(
      PLATFORMS.map(async (platform) => {
        const trends = allTrends[platform];
        if (!trends || trends.length === 0) {
          return { platform, successCount: 0, failCount: 0, error: 'No data' };
        }

        try {
          const result = await saveSnapshot(platform, trends);
          return { platform, ...result };
        } catch (error) {
          return {
            platform,
            successCount: 0,
            failCount: trends.length,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    // 统计结果
    const platformResults = results.map((r) => {
      if (r.status === 'fulfilled') {
        return r.value;
      }
      return {
        platform: 'unknown',
        successCount: 0,
        failCount: 0,
        error: r.reason?.message || 'Unknown error',
      };
    });

    const totalSuccess = platformResults.reduce((sum, r) => sum + r.successCount, 0);
    const totalFailed = platformResults.reduce((sum, r) => sum + r.failCount, 0);
    const successPlatforms = platformResults.filter((r) => r.successCount > 0).length;

    return NextResponse.json({
      success: totalFailed === 0,
      message: `Completed: ${successPlatforms}/${PLATFORMS.length} platforms, ${totalSuccess} items saved`,
      data: {
        platforms: platformResults,
        total: {
          success: totalSuccess,
          failed: totalFailed,
        },
      },
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
