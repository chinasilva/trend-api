import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import {
  getAccountAutomation,
  updateAccountAutomation,
} from '@/lib/pipeline/profile-service';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

function parseBody(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const body = raw as Record<string, unknown>;
  return {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    publishTime:
      typeof body.publishTime === 'string' || body.publishTime === null
        ? body.publishTime
        : undefined,
    leadMinutes:
      typeof body.leadMinutes === 'number' && Number.isFinite(body.leadMinutes)
        ? body.leadMinutes
        : undefined,
    timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
  };
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
    const data = await getAccountAutomation(id);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Account not found') ? 404 : 500;
    return NextResponse.json(
      {
        success: false,
        errorCode: 'ACCOUNT_AUTOMATION_FETCH_FAILED',
        message,
      },
      { status }
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
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

    const data = await updateAccountAutomation(id, parseBody(body));
    return NextResponse.json({
      success: true,
      data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Validation failed:') ? 400 : message.includes('Account not found') ? 404 : 500;
    return NextResponse.json(
      {
        success: false,
        errorCode: 'ACCOUNT_AUTOMATION_UPDATE_FAILED',
        message,
      },
      { status }
    );
  }
}
