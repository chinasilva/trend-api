import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { updateAccount } from '@/lib/pipeline/profile-service';
import type { AccountMutationInput } from '@/lib/pipeline/profile-service';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

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
  };
}

export async function PATCH(request: Request, { params }: RouteParams) {
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

    const account = await updateAccount(id, parseBody(body));
    return NextResponse.json({
      success: true,
      data: account,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isValidationError = message.startsWith('Validation failed:');
    const isNotFound = message.includes('Account not found');
    let errorCode = 'ACCOUNT_UPDATE_FAILED';
    let status = 500;

    if (isValidationError) {
      errorCode = 'ACCOUNT_VALIDATION_FAILED';
      status = 400;
    } else if (isNotFound) {
      errorCode = 'ACCOUNT_NOT_FOUND';
      status = 404;
    }

    return NextResponse.json(
      {
        success: false,
        errorCode,
        message,
      },
      { status }
    );
  }
}
