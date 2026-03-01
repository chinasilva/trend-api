import type {
  AccountListItem,
  AccountMutationInput,
  AccountProfileData,
  AccountProfileInput,
  AccountProfileVersionItem,
  DraftDetail,
  DraftGenerationData,
  DraftImagePlaceholder,
  OpportunityListData,
  OpportunityStatus,
  PublishJobResult,
  SyncOpportunitiesData,
} from '@/types/content-ui';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errorCode?: string;
}

function ensureSecret(secret: string, fieldName: string) {
  if (!secret.trim()) {
    throw new Error(`请先输入${fieldName}`);
  }
}

function buildHeaders(secret: string) {
  return {
    'Content-Type': 'application/json',
    'x-pipeline-secret': secret,
  };
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  let payload: ApiEnvelope<T> | null = null;

  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (!payload?.success) {
    throw new Error(payload?.message || payload?.error || '请求失败');
  }

  if (payload.data === undefined) {
    throw new Error('服务端未返回 data 字段');
  }

  return payload.data;
}

export async function syncOpportunities(secret: string, windowHours: number) {
  ensureSecret(secret, '同步密钥');
  return requestJson<SyncOpportunitiesData>('/api/pipeline/opportunities/sync', {
    method: 'POST',
    headers: buildHeaders(secret),
    body: JSON.stringify({ windowHours }),
  });
}

export async function listOpportunities(
  secret: string,
  params: {
    status?: OpportunityStatus;
    accountId?: string;
    page?: number;
    pageSize?: number;
  }
) {
  ensureSecret(secret, 'API 密钥');
  const search = new URLSearchParams();
  if (params.status) {
    search.set('status', params.status);
  }
  if (params.accountId) {
    search.set('accountId', params.accountId);
  }
  search.set('page', String(params.page ?? 1));
  search.set('pageSize', String(params.pageSize ?? 20));

  return requestJson<OpportunityListData>(`/api/opportunities?${search.toString()}`, {
    headers: buildHeaders(secret),
  });
}

export async function generateDraft(
  secret: string,
  opportunityId: string,
  options?: {
    profileOverride?: Partial<AccountProfileInput>;
    regenerateFromDraftId?: string;
  }
) {
  ensureSecret(secret, 'API 密钥');
  return requestJson<DraftGenerationData>('/api/drafts/generate', {
    method: 'POST',
    headers: buildHeaders(secret),
    body: JSON.stringify({
      opportunityId,
      profileOverride: options?.profileOverride,
      regenerateFromDraftId: options?.regenerateFromDraftId,
    }),
  });
}

export async function regenerateDraft(secret: string, draftId: string) {
  ensureSecret(secret, 'API 密钥');
  return requestJson<DraftGenerationData>(`/api/drafts/${draftId}/regenerate`, {
    method: 'POST',
    headers: buildHeaders(secret),
  });
}

export async function planDraftAssets(
  secret: string,
  draftId: string,
  options?: {
    imageCount?: number;
    stylePreset?: string;
  }
) {
  ensureSecret(secret, 'API 密钥');
  return requestJson<{ imagePlan: DraftImagePlaceholder[]; status: 'planned' }>(
    `/api/drafts/${draftId}/assets/plan`,
    {
      method: 'POST',
      headers: buildHeaders(secret),
      body: JSON.stringify({
        imageCount: options?.imageCount ?? 4,
        stylePreset: options?.stylePreset ?? 'news-analysis',
      }),
    }
  );
}

export async function getDraftDetail(secret: string, draftId: string) {
  ensureSecret(secret, 'API 密钥');
  return requestJson<DraftDetail>(`/api/drafts/${draftId}`, {
    headers: buildHeaders(secret),
  });
}

export async function publishWechatDraft(secret: string, draftId: string, autoRun = true) {
  ensureSecret(secret, 'API 密钥');
  return requestJson<PublishJobResult>('/api/publish/wechat', {
    method: 'POST',
    headers: buildHeaders(secret),
    body: JSON.stringify({ draftId, autoRun }),
  });
}

export async function retryPublishJob(secret: string, jobId: string, allowReview = false) {
  ensureSecret(secret, 'API 密钥');
  return requestJson<PublishJobResult>(`/api/publish/jobs/${jobId}/retry`, {
    method: 'POST',
    headers: buildHeaders(secret),
    body: JSON.stringify({ allowReview }),
  });
}

export async function listAccounts(
  secret: string,
  options?: {
    includeInactive?: boolean;
  }
) {
  ensureSecret(secret, 'API 密钥');
  const search = new URLSearchParams();
  if (options?.includeInactive) {
    search.set('includeInactive', 'true');
  }

  const query = search.toString();
  const endpoint = query ? `/api/accounts?${query}` : '/api/accounts';

  return requestJson<AccountListItem[]>(endpoint, {
    headers: buildHeaders(secret),
  });
}

export async function createAccount(secret: string, payload: AccountMutationInput) {
  ensureSecret(secret, 'API 密钥');
  return requestJson<AccountListItem>('/api/accounts', {
    method: 'POST',
    headers: buildHeaders(secret),
    body: JSON.stringify(payload),
  });
}

export async function updateAccount(secret: string, accountId: string, payload: AccountMutationInput) {
  ensureSecret(secret, 'API 密钥');
  return requestJson<AccountListItem>(`/api/accounts/${accountId}`, {
    method: 'PATCH',
    headers: buildHeaders(secret),
    body: JSON.stringify(payload),
  });
}

export async function getAccountProfile(secret: string, accountId: string) {
  ensureSecret(secret, 'API 密钥');
  return requestJson<{ profile: AccountProfileData; versions: AccountProfileVersionItem[] }>(
    `/api/accounts/${accountId}/profile`,
    {
      headers: buildHeaders(secret),
    }
  );
}

export async function updateAccountProfile(
  secret: string,
  accountId: string,
  profile: AccountProfileInput
) {
  ensureSecret(secret, 'API 密钥');
  return requestJson<{ profile: AccountProfileData; versions: AccountProfileVersionItem[] }>(
    `/api/accounts/${accountId}/profile`,
    {
      method: 'PUT',
      headers: buildHeaders(secret),
      body: JSON.stringify(profile),
    }
  );
}

export async function rollbackAccountProfile(secret: string, accountId: string, versionId: string) {
  ensureSecret(secret, 'API 密钥');
  return requestJson<{ profile: AccountProfileData; versions: AccountProfileVersionItem[] }>(
    `/api/accounts/${accountId}/profile/rollback`,
    {
      method: 'POST',
      headers: buildHeaders(secret),
      body: JSON.stringify({ versionId }),
    }
  );
}
