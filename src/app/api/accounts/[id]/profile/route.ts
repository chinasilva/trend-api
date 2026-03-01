import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import {
  getAccountProfileWithVersions,
  updateAccountProfile,
} from '@/lib/pipeline/profile-service';
import type { AccountProfileInput } from '@/types/pipeline';

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
    const result = await getAccountProfileWithVersions(id);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Account not found') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        errorCode: 'ACCOUNT_PROFILE_FETCH_FAILED',
        message,
      },
      { status }
    );
  }
}

function parseBody(raw: unknown): Partial<AccountProfileInput> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const body = raw as Record<string, unknown>;
  return {
    audience: typeof body.audience === 'string' ? body.audience : undefined,
    tone: typeof body.tone === 'string' ? body.tone : undefined,
    growthGoal: typeof body.growthGoal === 'string' ? body.growthGoal : undefined,
    painPoints: Array.isArray(body.painPoints)
      ? body.painPoints.filter((item): item is string => typeof item === 'string')
      : undefined,
    contentPromise: typeof body.contentPromise === 'string' ? body.contentPromise : undefined,
    forbiddenTopics: Array.isArray(body.forbiddenTopics)
      ? body.forbiddenTopics.filter((item): item is string => typeof item === 'string')
      : undefined,
    ctaStyle: typeof body.ctaStyle === 'string' ? body.ctaStyle : undefined,
    preferredLength:
      typeof body.preferredLength === 'number' && Number.isFinite(body.preferredLength)
        ? body.preferredLength
        : undefined,
  };
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

    const payload = parseBody(body);
    const result = await updateAccountProfile(id, payload);

    return NextResponse.json({
      success: true,
      data: result,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Account not found') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        errorCode: 'ACCOUNT_PROFILE_UPDATE_FAILED',
        message,
      },
      { status }
    );
  }
}
