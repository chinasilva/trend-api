import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { syncOpportunities } from '@/lib/pipeline/opportunity-service';

export const dynamic = 'force-dynamic';

function parseWindowHours(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 2;
  }

  return Math.min(24, Math.max(1, Math.floor(value)));
}

export async function POST(request: Request) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_SYNC_SECRET',
    });
    if (authError) {
      return authError;
    }

    let payload: { windowHours?: number } = {};
    try {
      payload = (await request.json()) as { windowHours?: number };
    } catch {
      payload = {};
    }

    const result = await syncOpportunities(parseWindowHours(payload.windowHours));

    return NextResponse.json({
      success: true,
      data: result,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        errorCode: 'OPPORTUNITY_SYNC_FAILED',
        message,
      },
      { status: 500 }
    );
  }
}
