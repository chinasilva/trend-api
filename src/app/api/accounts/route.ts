import { NextResponse } from 'next/server';
import { requireSecretAuth } from '@/lib/pipeline/auth';
import { listActiveAccounts } from '@/lib/pipeline/profile-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authError = requireSecretAuth(request, {
      envKey: 'PIPELINE_API_SECRET',
    });
    if (authError) {
      return authError;
    }

    const accounts = await listActiveAccounts();
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
