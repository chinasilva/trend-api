import { NextResponse } from 'next/server';
import { fetchTrends } from '@/lib/scraper';
import { getCache, setCache } from '@/lib/cache';
import { PLATFORMS, type Platform } from '@/types/trend';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    platform: string;
  }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { platform } = await params;

  // 验证平台
  if (!PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json(
      {
        success: false,
        platform,
        error: `Invalid platform. Supported: ${PLATFORMS.join(', ')}`,
        data: [],
      },
      { status: 400 }
    );
  }

  try {
    // 先尝试从缓存获取
    let data = getCache(platform as Platform);

    if (!data) {
      // 缓存未命中，爬取数据
      data = await fetchTrends(platform as Platform);
      setCache(platform as Platform, data);
    }

    return NextResponse.json({
      success: true,
      platform,
      data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        platform,
        error: message,
        data: [],
      },
      { status: 500 }
    );
  }
}
