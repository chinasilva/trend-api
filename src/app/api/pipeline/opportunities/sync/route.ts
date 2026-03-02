import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_SYNC_SECRET',
    });
    if (authError) {
      return authError;
    }

    return NextResponse.json({
      success: false,
      errorCode: 'OPPORTUNITY_SYNC_DEPRECATED',
      message:
        'This endpoint is deprecated. Use POST /api/pipeline/opportunities/realtime/compute and POST /api/pipeline/opportunities/realtime/generate.',
      updatedAt: new Date().toISOString(),
    }, { status: 410 });
  } catch {
    return NextResponse.json(
      {
        success: false,
        errorCode: 'OPPORTUNITY_SYNC_DEPRECATED',
        message:
          'This endpoint is deprecated. Use POST /api/pipeline/opportunities/realtime/compute and POST /api/pipeline/opportunities/realtime/generate.',
      },
      { status: 410 }
    );
  }
}
