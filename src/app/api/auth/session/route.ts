import { NextResponse } from 'next/server';
import { getPipelineSessionFromRequest } from '@/lib/pipeline/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = getPipelineSessionFromRequest(request);

  return NextResponse.json({
    success: true,
    data: {
      authenticated: Boolean(session),
      username: session?.username ?? null,
      expiresAt: session?.expiresAt ? new Date(session.expiresAt).toISOString() : null,
    },
  });
}
