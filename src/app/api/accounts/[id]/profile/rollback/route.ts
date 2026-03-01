import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { rollbackAccountProfile } from '@/lib/pipeline/profile-service';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
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

    const versionId =
      body && typeof body === 'object' && typeof (body as Record<string, unknown>).versionId === 'string'
        ? ((body as Record<string, unknown>).versionId as string).trim()
        : '';

    if (!versionId) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_INPUT',
          message: 'versionId is required.',
        },
        { status: 400 }
      );
    }

    const result = await rollbackAccountProfile(id, versionId);

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
        errorCode: 'ACCOUNT_PROFILE_ROLLBACK_FAILED',
        message,
      },
      { status }
    );
  }
}
