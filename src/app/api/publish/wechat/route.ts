import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { createWechatPublishJob } from '@/lib/pipeline/publish-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_API_SECRET',
    });
    if (authError) {
      return authError;
    }

    const body = (await request.json()) as {
      draftId?: string;
      autoRun?: boolean;
    };

    const draftId = body.draftId?.trim();
    if (!draftId) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_INPUT',
          message: 'draftId is required.',
        },
        { status: 400 }
      );
    }

    const result = await createWechatPublishJob({
      draftId,
      autoRun: body.autoRun,
    });

    return NextResponse.json({
      success: true,
      data: result,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Draft not found') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        errorCode: 'PUBLISH_JOB_CREATE_FAILED',
        message,
      },
      { status }
    );
  }
}
