import type { TrendItem } from '@/types/trend';

const ZHIHU_HOT_API = 'https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit=50&desktop=true';

function parseZhihuHotValue(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/\s+/g, '');
  const matched = cleaned.match(/([\d.]+)(亿|万)?/);
  if (!matched) return undefined;

  const base = Number(matched[1]);
  if (Number.isNaN(base)) return undefined;

  if (matched[2] === '亿') return Math.round(base * 100000000);
  if (matched[2] === '万') return Math.round(base * 10000);
  return Math.round(base);
}

export async function fetchZhihu(): Promise<TrendItem[]> {
  const response = await fetch(ZHIHU_HOT_API, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`Zhihu API request failed: ${response.status}`);
  }

  const result = await response.json();
  const list = Array.isArray(result?.data) ? result.data : [];
  if (list.length === 0) {
    throw new Error('Zhihu API returned empty data');
  }

  return list.map((item: {
    target?: {
      title_area?: { text?: string };
      excerpt_area?: { text?: string };
      metrics_area?: { text?: string };
      link?: { url?: string };
      image_area?: { url?: string };
    };
  }, index: number) => ({
    title: item.target?.title_area?.text || '',
    hotValue: parseZhihuHotValue(item.target?.metrics_area?.text),
    url: item.target?.link?.url,
    description: item.target?.excerpt_area?.text,
    thumbnail: item.target?.image_area?.url,
    rank: index + 1,
  })).filter((item: TrendItem) => item.title.length > 0);
}

export { parseZhihuHotValue };
