import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { createAccount, listAccounts } from '@/lib/pipeline/profile-service';
import type { AccountMutationInput } from '@/lib/pipeline/profile-service';

export const dynamic = 'force-dynamic';

function parseBody(raw: unknown): AccountMutationInput {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const body = raw as Record<string, unknown>;
  return {
    name: typeof body.name === 'string' ? body.name : undefined,
    platform: typeof body.platform === 'string' ? body.platform : undefined,
    description: typeof body.description === 'string' ? body.description : undefined,
    isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
    autoPublish: typeof body.autoPublish === 'boolean' ? body.autoPublish : undefined,
    dailyLimit:
      typeof body.dailyLimit === 'number' && Number.isFinite(body.dailyLimit)
        ? body.dailyLimit
        : undefined,
    autoGenerateEnabled:
      typeof body.autoGenerateEnabled === 'boolean' ? body.autoGenerateEnabled : undefined,
    autoGenerateTime:
      typeof body.autoGenerateTime === 'string' || body.autoGenerateTime === null
        ? body.autoGenerateTime
        : undefined,
    autoGenerateLeadMinutes:
      typeof body.autoGenerateLeadMinutes === 'number' && Number.isFinite(body.autoGenerateLeadMinutes)
        ? body.autoGenerateLeadMinutes
        : undefined,
    autoGenerateTimezone:
      typeof body.autoGenerateTimezone === 'string' ? body.autoGenerateTimezone : undefined,
  };
}

export async function GET(request: Request) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_API_SECRET',
    });
    if (authError) {
      return authError;
    }

    const searchParams = new URL(request.url).searchParams;
    const includeInactive = ['1', 'true', 'yes'].includes(
      (searchParams.get('includeInactive') || '').toLowerCase()
    );

    const accounts = await listAccounts({ includeInactive });
    return NextResponse.json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        errorCode: 'ACCOUNT_LIST_FAILED',
        message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_API_SECRET',
    });
    if (authError) {
      return authError;
    }

    let body: unknown = {};
    try {
      body = (await request.json()) as unknown;
    } catch {
      body = {};
    }

    const account = await createAccount(parseBody(body));
    return NextResponse.json(
      {
        success: true,
        data: account,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isValidationError = message.startsWith('Validation failed:');
    return NextResponse.json(
      {
        success: false,
        errorCode: isValidationError ? 'ACCOUNT_VALIDATION_FAILED' : 'ACCOUNT_CREATE_FAILED',
        message,
      },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
