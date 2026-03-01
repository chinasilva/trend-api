export const SESSION_AUTH_PLACEHOLDER = '__SESSION_AUTH__';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errorCode?: string;
}

export interface PipelineSessionData {
  authenticated: boolean;
  username: string | null;
  expiresAt?: string | null;
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

export async function fetchPipelineSession() {
  return requestJson<PipelineSessionData>('/api/auth/session', {
    cache: 'no-store',
  });
}

export async function loginPipeline(username: string, password: string) {
  return requestJson<PipelineSessionData>('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
}

export async function logoutPipeline() {
  return requestJson<PipelineSessionData>('/api/auth/logout', {
    method: 'POST',
  });
}
