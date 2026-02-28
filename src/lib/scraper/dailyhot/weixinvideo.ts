import type { TrendItem } from '@/types/trend';

const ITAPI_BASE_URL = process.env.ITAPI_BASE_URL || 'https://api.itapi.cn';
const ITAPI_API = `${ITAPI_BASE_URL}/api/hotnews/weixin`;
const DAILYHOT_API = 'https://api.dailyhot.com/api/v1';
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

function toTrendItem(item: Record<string, unknown>, index: number): TrendItem {
  const title =
    (typeof item.title === 'string' && item.title) ||
    (typeof item.word === 'string' && item.word) ||
    (typeof item.hot_word === 'string' && item.hot_word) ||
    (typeof item.keyword === 'string' && item.keyword) ||
    (typeof item.name === 'string' && item.name) ||
    `视频号热榜 #${index + 1}`;

  const url =
    (typeof item.url === 'string' && item.url) ||
    (typeof item.link === 'string' && item.link) ||
    undefined;

  const thumbnail =
    (typeof item.cover === 'string' && item.cover) ||
    (typeof item.icon === 'string' && item.icon) ||
    (typeof item.thumb === 'string' && item.thumb) ||
    undefined;

  const rankValue = Number(item.rank);

  return {
    title,
    hotValue: toNumber(item.hot_value ?? item.hot ?? item.score ?? item.heat ?? item.viewnum),
    url,
    thumbnail,
    rank: Number.isFinite(rankValue) && rankValue > 0 ? rankValue : index + 1,
  };
}

function readArrayData(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const candidates = [obj.list, obj.items, obj.hot_words, obj.hotWords, obj.data, obj.topics];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
      }
    }
  }

  return [];
}

function resolveSourceFromExtra(extra: Record<string, unknown> | undefined, fallback: string): string {
  if (!extra) {
    return fallback;
  }
  const source = extra.source;
  return typeof source === 'string' && source ? source : fallback;
}

async function fetchFromItapi(apiKey: string): Promise<TrendItem[]> {
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
    data?: unknown;
  };

  if (result.code !== 200) {
    throw new Error(`ITAPI error: ${result.msg || 'Unknown error'}`);
  }

  const list = readArrayData(result.data);
  if (list.length === 0) {
    throw new Error('Invalid ITAPI response');
  }

  return list.map((item, index) => ({
    ...toTrendItem(item, index),
    extra: {
      source: 'itapi-weixin',
      note: '替代视频号热榜来源',
    },
  }));
}

async function fetchFromDailyHot(): Promise<TrendItem[]> {
  const response = await fetch(`${DAILYHOT_API}/weixinvideo`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`DailyHotApi request failed: ${response.status}`);
  }

  const result = await response.json() as { data?: unknown };
  const list = readArrayData(result.data);
  if (list.length === 0) {
    throw new Error('Invalid DailyHotApi response');
  }
  return list.map((item, index) => toTrendItem(item, index));
}

async function fetchFromTianapiWeixin(): Promise<TrendItem[]> {
  const { fetchWeixin } = await import('@/lib/scraper/tianapi/weixin');
  try {
    const data = await fetchWeixin();
    if (data.length > 0) {
      return data.map((item) => ({
        ...item,
        extra: {
          ...(item.extra || {}),
          source: resolveSourceFromExtra(item.extra, 'tianapi-weixin'),
          note: '替代视频号热榜来源',
        },
      }));
    }
  } catch {
    // fallback to weixin article source
  }

  const { fetchWeixinArticle } = await import('@/lib/scraper/tianapi/weixinArticle');
  const articles = await fetchWeixinArticle();
  return articles.map((item) => ({
    ...item,
    extra: {
      ...(item.extra || {}),
      source: 'tianapi-wxnew',
      note: '替代视频号热榜来源',
    },
  }));
}

export async function fetchWeixinvideo(): Promise<TrendItem[]> {
  const errors: string[] = [];
  const itapiKey = process.env.ITAPI_KEY;

  if (itapiKey) {
    try {
      return await fetchFromItapi(itapiKey);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'ITAPI unknown error');
    }
  } else {
    errors.push('ITAPI_KEY is not configured');
  }

  try {
    return await fetchFromDailyHot();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'DailyHotApi unknown error');
  }

  try {
    return await fetchFromTianapiWeixin();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'TianAPI Weixin unknown error');
  }

  throw new Error(`Failed to fetch weixinvideo data: ${errors.join(' | ')}`);
}
