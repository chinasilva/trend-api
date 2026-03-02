import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { syncOpportunities } from '@/lib/pipeline/opportunity-service';
import type { OpportunityWindowConfig } from '@/types/pipeline';

export const dynamic = 'force-dynamic';

function parseWindowHours(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 2;
  }

  return Math.min(24, Math.max(1, Math.floor(value)));
}

function parseWindows(value: unknown): OpportunityWindowConfig[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        label: typeof row.label === 'string' ? row.label : '',
        hours: typeof row.hours === 'number' ? row.hours : NaN,
        weight: typeof row.weight === 'number' ? row.weight : NaN,
      };
    })
    .filter(
      (item) =>
        item.label.trim().length > 0 &&
        Number.isFinite(item.hours) &&
        Number.isFinite(item.weight)
    );

  return parsed.length > 0 ? parsed : undefined;
}

export async function POST(request: Request) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_SYNC_SECRET',
    });
    if (authError) {
      return authError;
    }

    let payload: { windowHours?: number; windows?: OpportunityWindowConfig[] } = {};
    try {
      payload = (await request.json()) as { windowHours?: number; windows?: OpportunityWindowConfig[] };
    } catch {
      payload = {};
    }

    const windows = parseWindows(payload.windows);
    const result = windows
      ? await syncOpportunities({ windows })
      : await syncOpportunities(parseWindowHours(payload.windowHours));

    return NextResponse.json({
      success: true,
      data: result,
      deprecated: true,
      warning:
        'POST /api/pipeline/opportunities/sync is deprecated. Please migrate to realtime/compute and realtime/generate.',
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
