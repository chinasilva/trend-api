import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { runScheduledAutoGenerate } from '@/lib/pipeline/auto-generate-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_SYNC_SECRET',
    });
    if (authError) {
      return authError;
    }

    const result = await runScheduledAutoGenerate(new Date());

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
        errorCode: 'AUTO_GENERATE_RUN_FAILED',
        message,
      },
      { status: 500 }
    );
  }
}
