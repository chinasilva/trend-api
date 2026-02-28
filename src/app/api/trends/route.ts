import { NextRequest, NextResponse } from 'next/server';
import { getTrendsFromDB, formatTrendsForAPI, getLatestSnapshot, getAllTrendsByDate, getTrendsByDate } from '@/lib/db';
import { PLATFORMS, type Platform } from '@/types/trend';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const platform = searchParams.get('platform') as Platform | null;

    let data: Record<Platform, unknown[]>;
    let snapshotAt: string | null;
    let source: string;

    if (dateParam) {
      // 解析日期参数
      const date = new Date(dateParam);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid date format. Use ISO format like 2026-02-27',
            data: {},
          },
          { status: 400 }
        );
      }

      // 查询指定日期的数据
      if (platform) {
        const trends = await getTrendsByDate(platform, date);
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
      const snapshotResult = await getLatestSnapshot(platform || undefined);

      if (snapshotResult.snapshotAt && Object.keys(snapshotResult.trends).length > 0) {
        data = snapshotResult.trends as Record<Platform, unknown[]>;
        snapshotAt = snapshotResult.snapshotAt;
        source = 'snapshot';
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
        source = 'database';
      }
    }

    // 检查是否有数据
    const hasData = PLATFORMS.some(p => data[p]?.length > 0);

    return NextResponse.json({
      success: true,
      data,
      snapshotAt,
      source,
      hasData,
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
