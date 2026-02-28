import { NextRequest, NextResponse } from 'next/server';
import { getSnapshotTimeline } from '@/lib/db';
import { PLATFORMS, type Platform } from '@/types/trend';

export const dynamic = 'force-dynamic';

function parsePlatform(platform: string | null): Platform | null {
  if (!platform) {
    return null;
  }

  if (!PLATFORMS.includes(platform as Platform)) {
    return null;
  }

  return platform as Platform;
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPlatform = searchParams.get('platform');
    const platform = parsePlatform(rawPlatform);
    if (rawPlatform && !platform) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_PLATFORM',
          message: 'Invalid platform parameter.',
        },
        { status: 400 }
      );
    }

    const page = parsePositiveInt(searchParams.get('page'), 1);
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), 20);
    const result = await getSnapshotTimeline(page, pageSize, platform || undefined);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[GET /api/trends/timeline] failed:', error);
    return NextResponse.json(
      {
        success: false,
        errorCode: 'TIMELINE_FETCH_FAILED',
        message: 'Failed to load timeline. Please retry later.',
      },
      { status: 500 }
    );
  }
}
