import { NextResponse } from 'next/server';
import {
  applyPipelineSessionCookie,
  createPipelineSessionToken,
  getPipelineCredentials,
  verifyPipelineCredentials,
} from '@/lib/pipeline/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    let body: unknown = {};
    try {
      body = (await request.json()) as unknown;
    } catch {
      body = {};
    }

    const username =
      body && typeof body === 'object' && typeof (body as Record<string, unknown>).username === 'string'
        ? ((body as Record<string, unknown>).username as string).trim()
        : '';
    const password =
      body && typeof body === 'object' && typeof (body as Record<string, unknown>).password === 'string'
        ? ((body as Record<string, unknown>).password as string)
        : '';

    if (!username || !password) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_INPUT',
          message: 'username and password are required.',
        },
        { status: 400 }
      );
    }

    if (!getPipelineCredentials()) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'PIPELINE_AUTH_NOT_CONFIGURED',
          message: 'PIPELINE_ADMIN_USERNAME/PIPELINE_ADMIN_PASSWORD are not configured.',
        },
        { status: 500 }
      );
    }

    if (!verifyPipelineCredentials(username, password)) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password.',
        },
        { status: 401 }
      );
    }

    const token = createPipelineSessionToken(username);
    const response = NextResponse.json({
      success: true,
      data: {
        authenticated: true,
        username,
      },
    });

    applyPipelineSessionCookie(response, token);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        errorCode: 'PIPELINE_LOGIN_FAILED',
        message,
      },
      { status: 500 }
    );
  }
}
