import { NextResponse } from 'next/server';

interface SecretAuthOptions {
  envKey: 'PIPELINE_API_SECRET' | 'PIPELINE_SYNC_SECRET';
  headerName?: 'x-pipeline-secret';
}

export function requireSecretAuth(request: Request, options: SecretAuthOptions) {
  const headerName = options.headerName ?? 'x-pipeline-secret';
  const expectedSecret = process.env[options.envKey];

  if (!expectedSecret) {
    return NextResponse.json(
      {
        success: false,
        errorCode: `${options.envKey}_NOT_CONFIGURED`,
        message: `${options.envKey} is not configured.`,
      },
      { status: 500 }
    );
  }

  const secret = request.headers.get(headerName);
  if (!secret || secret !== expectedSecret) {
    return NextResponse.json(
      {
        success: false,
        errorCode: 'UNAUTHORIZED',
        message: 'Unauthorized request.',
      },
      { status: 401 }
    );
  }

  return null;
}
