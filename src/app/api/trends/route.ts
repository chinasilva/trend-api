import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { saveTrends } from '@/lib/db';
import { PLATFORMS, type Platform, type TrendItem } from '@/types/trend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result: Record<Platform, TrendItem[]> = {} as Record<Platform, TrendItem[]>;
    let hasError = false;
    const dbSaveResults: Partial<Record<Platform, { successCount: number; failCount: number }>> = {};

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

          // 保存到数据库（带去重）
          try {
            const saveResult = await saveTrends(platform, data);
            dbSaveResults[platform] = saveResult;
          } catch (dbError) {
            console.error(`Failed to save trends for ${platform}:`, dbError);
          }
        }

        return { platform, data, error: null };
      } catch (error) {
        hasError = true;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // 即使失败也返回空数组
        return { platform, data: [], error: errorMessage };
      }
    });

    const results = await Promise.all(promises);

    results.forEach(({ platform, data, error }) => {
      result[platform] = data.map((item: TrendItem) => ({
        ...item,
        _error: error,
      }));
    });

    return NextResponse.json({
      success: !hasError,
      data: result,
      updatedAt: new Date().toISOString(),
      dbSaved: dbSaveResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      {
        success: false,
        error: message,
        data: {},
      },
      { status: 500 }
    );
  }
}
