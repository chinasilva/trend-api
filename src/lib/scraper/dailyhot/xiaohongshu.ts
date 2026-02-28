import type { TrendItem } from '@/types/trend';

const ITAPI_BASE_URL = process.env.ITAPI_BASE_URL || 'https://api.itapi.cn';
const ITAPI_API = `${ITAPI_BASE_URL}/api/hotnews/xiaohongshu`;
const FETCH_TIMEOUT_MS = Number(process.env.TREND_FETCH_TIMEOUT_MS || 5000);

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[, ]/g, '').trim();
    if (!cleaned) {
      return undefined;
    }
    const wanMatch = cleaned.match(/^(\d+(?:\.\d+)?)w$/i);
    if (wanMatch) {
      return Number(wanMatch[1]) * 10000;
    }
    const wanCnMatch = cleaned.match(/^(\d+(?:\.\d+)?)万$/);
    if (wanCnMatch) {
      return Number(wanCnMatch[1]) * 10000;
    }
    const yiMatch = cleaned.match(/^(\d+(?:\.\d+)?)亿$/);
    if (yiMatch) {
      return Number(yiMatch[1]) * 100000000;
    }
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export async function fetchXiaohongshu(): Promise<TrendItem[]> {
  const apiKey = process.env.ITAPI_KEY;

  if (!apiKey) {
    throw new Error('ITAPI_KEY is not configured');
  }

  const url = new URL(ITAPI_API);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`ITAPI request failed: ${response.status}`);
  }

  const result = await response.json() as {
    code?: number;
    msg?: string;
    data?: Array<{
      rank?: number | string;
      name?: string;
      viewnum?: number | string;
      icon?: string | null;
      url?: string;
    }>;
  };

  if (result.code !== 200) {
    throw new Error(`ITAPI error: ${result.msg || 'Unknown error'}`);
  }

  if (!Array.isArray(result.data) || result.data.length === 0) {
    throw new Error('Invalid ITAPI response');
  }

  return result.data.map((item, index) => {
    const rank = Number(item.rank);
    return {
      title: item.name || `小红书热榜 #${index + 1}`,
      hotValue: toNumber(item.viewnum),
      url: item.url,
      thumbnail: item.icon || undefined,
      rank: Number.isFinite(rank) && rank > 0 ? rank : index + 1,
      extra: {
        source: 'itapi',
      },
    };
  });
}
