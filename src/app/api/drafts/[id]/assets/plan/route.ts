import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { planDraftAssets } from '@/lib/pipeline/draft-service';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

function normalizeImageCount(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 4;
  }

  return Math.min(5, Math.max(3, Math.round(value)));
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
    let body: unknown = {};

    try {
      body = (await request.json()) as unknown;
    } catch {
      body = {};
    }

    const imageCount =
      body && typeof body === 'object'
        ? normalizeImageCount((body as Record<string, unknown>).imageCount)
        : 4;
    const stylePreset =
      body && typeof body === 'object' && typeof (body as Record<string, unknown>).stylePreset === 'string'
        ? ((body as Record<string, unknown>).stylePreset as string).trim()
        : 'news-analysis';

    const result = await planDraftAssets({
      draftId: id,
      imageCount,
      stylePreset,
    });

    return NextResponse.json({
      success: true,
      data: result,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        errorCode: 'DRAFT_ASSET_PLAN_FAILED',
        message,
      },
      { status }
    );
  }
}
