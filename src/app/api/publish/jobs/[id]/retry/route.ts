import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { retryPublishJob } from '@/lib/pipeline/publish-service';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_API_SECRET',
    });
    if (authError) {
      return authError;
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { allowReview?: boolean };

    const result = await retryPublishJob(id, body.allowReview === true);

    return NextResponse.json({
      success: true,
      data: result,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : 400;

    return NextResponse.json(
      {
        success: false,
        errorCode: 'PUBLISH_JOB_RETRY_FAILED',
        message,
      },
      { status }
    );
  }
}
