import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { generateDraftFromOpportunity } from '@/lib/pipeline/draft-service';
import type { AccountProfileInput } from '@/types/pipeline';

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
      opportunityId?: string;
      profileOverride?: Partial<AccountProfileInput>;
      regenerateFromDraftId?: string;
    };
    const opportunityId = body.opportunityId?.trim();

    if (!opportunityId) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_INPUT',
          message: 'opportunityId is required.',
        },
        { status: 400 }
      );
    }

    const result = await generateDraftFromOpportunity(opportunityId, {
      profileOverride: body.profileOverride,
      regenerateFromDraftId: body.regenerateFromDraftId?.trim() || undefined,
    });

    return NextResponse.json({
      success: true,
      data: result,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Opportunity not found') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        errorCode: 'DRAFT_GENERATE_FAILED',
        message,
      },
      { status }
    );
  }
}
