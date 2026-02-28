import { OpportunityStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { listOpportunities } from '@/lib/pipeline/opportunity-service';

export const dynamic = 'force-dynamic';

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function parseStatus(status: string | null) {
  if (!status) {
    return null;
  }

  if (Object.values(OpportunityStatus).includes(status as OpportunityStatus)) {
    return status as OpportunityStatus;
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_API_SECRET',
    });
    if (authError) {
      return authError;
    }

    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get('status');
    const status = parseStatus(rawStatus);

    if (rawStatus && !status) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_STATUS',
          message: `Invalid status. Supported: ${Object.values(OpportunityStatus).join(', ')}`,
        },
        { status: 400 }
      );
    }

    const result = await listOpportunities({
      accountId: searchParams.get('accountId') || undefined,
      status: status ?? undefined,
      page: parsePositiveInt(searchParams.get('page'), 1),
      pageSize: parsePositiveInt(searchParams.get('pageSize'), 20),
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        errorCode: 'OPPORTUNITY_LIST_FAILED',
        message,
      },
      { status: 500 }
    );
  }
}
