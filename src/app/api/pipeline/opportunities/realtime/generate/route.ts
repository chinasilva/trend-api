import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import {
  generateDraftFromRealtimeSession,
  RealtimeOpportunityError,
} from '@/lib/pipeline/realtime-opportunity-service';

export const dynamic = 'force-dynamic';

interface GeneratePayload {
  accountId?: string;
  sessionId?: string;
}

export async function POST(request: Request) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_API_SECRET',
    });
    if (authError) {
      return authError;
    }

    let payload: GeneratePayload = {};
    try {
      payload = (await request.json()) as GeneratePayload;
    } catch {
      payload = {};
    }

    const accountId = payload.accountId?.trim();
    const sessionId = payload.sessionId?.trim();

    if (!accountId || !sessionId) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_INPUT',
          message: 'accountId and sessionId are required.',
        },
        { status: 400 }
      );
    }

    const result = await generateDraftFromRealtimeSession({
      accountId,
      sessionId,
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
        errorCode: 'REALTIME_OPPORTUNITY_GENERATE_FAILED',
        message,
      },
      { status: 500 }
    );
  }
}
