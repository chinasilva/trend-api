import type { TrendItem } from '@/types/trend';

const TIANAPI_BASE_URL = 'https://api.tianapi.com';

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

  const url = `${TIANAPI_BASE_URL}${path}?key=${key}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    next: { revalidate: 300 }, // 5分钟缓存
  });

  if (!response.ok) {
    throw new Error(`TianAPI request failed: ${response.status}`);
  }

  const result = await response.json();

  if (result.code !== 200) {
    throw new Error(`TianAPI error: ${result.msg || result.message}`);
  }

  return transform(result.newslist || result.list || []);
}
