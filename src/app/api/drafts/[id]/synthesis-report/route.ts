import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { getSynthesisReportByDraftId } from '@/lib/pipeline/auto-generate-service';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_API_SECRET',
    });
    if (authError) {
      return authError;
    }

    const { id } = await params;
    const result = await getSynthesisReportByDraftId(id);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json(
      {
        success: false,
        errorCode: 'SYNTHESIS_REPORT_FETCH_FAILED',
        message,
      },
      { status }
    );
  }
}
