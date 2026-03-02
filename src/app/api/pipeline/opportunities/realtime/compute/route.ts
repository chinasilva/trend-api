import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import {
  computeRealtimeOpportunitySession,
  RealtimeOpportunityError,
} from '@/lib/pipeline/realtime-opportunity-service';

export const dynamic = 'force-dynamic';

interface ComputePayload {
  accountId?: string;
  topN?: number;
  refresh?: boolean;
}

export async function POST(request: Request) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_API_SECRET',
    });
    if (authError) {
      return authError;
    }

    let payload: ComputePayload = {};
    try {
      payload = (await request.json()) as ComputePayload;
    } catch {
      payload = {};
    }

    const accountId = payload.accountId?.trim();
    if (!accountId) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_INPUT',
          message: 'accountId is required.',
        },
        { status: 400 }
      );
    }

    const result = await computeRealtimeOpportunitySession({
      accountId,
      topN: payload.topN,
      refresh: payload.refresh === true,
    });

    return NextResponse.json({
      success: true,
      data: result,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof RealtimeOpportunityError) {
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
        errorCode: 'REALTIME_OPPORTUNITY_COMPUTE_FAILED',
        message,
      },
      { status: 500 }
    );
  }
}
