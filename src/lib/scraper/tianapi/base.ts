import type { TrendItem } from '@/types/trend';

const TIANAPI_BASE_URL = process.env.TIANAPI_BASE_URL || 'https://apis.tianapi.com';
const FETCH_TIMEOUT_MS = Number(process.env.TREND_FETCH_TIMEOUT_MS || 5000);

export interface TianApiConfig {
  key: string;
  path: string;
  transform: (data: unknown) => TrendItem[];
}

export async function fetchTianApi(config: TianApiConfig): Promise<TrendItem[]> {
  const { key, path, transform } = config;

  if (!key) {
    throw new Error('TIANAPI_KEY is not configured');
  }

  const separator = path.includes('?') ? '&' : '?';
  const url = `${TIANAPI_BASE_URL}${path}${separator}key=${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
    },
    next: { revalidate: 300 }, // 5分钟缓存
  });

  if (!response.ok) {
    throw new Error(`TianAPI request failed: ${response.status}`);
  }

  const result = await response.json();

  const responseCode = Number(result?.code);
  if (responseCode !== 200) {
    throw new Error(`TianAPI error: ${result?.msg || result?.message || 'Unknown error'}`);
  }

  // TianAPI has multiple payload shapes:
  // 1) { code, newslist: [...] }
  // 2) { code, list: [...] }
  // 3) { code, result: { list: [...] } }
  const list = result?.result?.list || result?.newslist || result?.list || [];
  return transform(list);
}
