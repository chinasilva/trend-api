import { NextResponse } from 'next/server';
import { clearPipelineSessionCookie } from '@/lib/pipeline/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    data: {
      authenticated: false,
    },
  });

  clearPipelineSessionCookie(response);
  return response;
}
