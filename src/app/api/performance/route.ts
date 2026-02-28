import { NextRequest, NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { listPerformanceMetrics } from '@/lib/pipeline/performance-service';

export const dynamic = 'force-dynamic';

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

function parseDate(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_API_SECRET',
    });
    if (authError) {
      return authError;
    }

    const { searchParams } = new URL(request.url);
    const from = parseDate(searchParams.get('from'));
    const to = parseDate(searchParams.get('to'));

    if (from === null || to === null) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_DATE',
          message: 'Invalid date format for from/to. Use ISO datetime.',
        },
        { status: 400 }
      );
    }

    const result = await listPerformanceMetrics({
      accountId: searchParams.get('accountId') || undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      page: parsePositiveInt(searchParams.get('page'), 1),
      pageSize: parsePositiveInt(searchParams.get('pageSize'), 20),
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        errorCode: 'PERFORMANCE_LIST_FAILED',
        message,
      },
      { status: 500 }
    );
  }
}
