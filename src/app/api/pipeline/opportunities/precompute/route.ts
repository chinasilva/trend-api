import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import {
  OpportunityPrecomputeError,
  runOpportunityPrecompute,
} from '@/lib/pipeline/opportunity-service';

export const dynamic = 'force-dynamic';

interface PrecomputePayload {
  topN?: number;
  lookbackHours?: number;
  force?: boolean;
}

export async function POST(request: Request) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_SYNC_SECRET',
    });
    if (authError) {
      return authError;
    }

    let payload: PrecomputePayload = {};
    try {
      payload = (await request.json()) as PrecomputePayload;
    } catch {
      payload = {};
    }

    const result = await runOpportunityPrecompute({
      topN: typeof payload.topN === 'number' ? payload.topN : undefined,
      lookbackHours: typeof payload.lookbackHours === 'number' ? payload.lookbackHours : undefined,
      force: payload.force === true,
    });

    return NextResponse.json({
      success: true,
      data: result,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof OpportunityPrecomputeError) {
      return NextResponse.json(
        {
          success: false,
          errorCode: error.code,
          message: error.message,
        },
        { status: error.status }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        errorCode: 'OPPORTUNITY_PRECOMPUTE_FAILED',
        message,
      },
      { status: 500 }
    );
  }
}
