import type { TrendItem } from '@/types/trend';

const BILIBILI_API = 'https://s.search.bilibili.com/main/hotword';

export async function fetchBilibili(): Promise<TrendItem[]> {
  const response = await fetch(BILIBILI_API, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`Bilibili API request failed: ${response.status}`);
  }

  const result = await response.json();

  if (!result.list || !Array.isArray(result.list)) {
    throw new Error('Invalid Bilibili API response');
  }

  return result.list.map((item: { keyword: string; heat_score: number }, index: number) => ({
    title: item.keyword,
    hotValue: item.heat_score,
    url: `https://search.bilibili.com/article?keyword=${encodeURIComponent(item.keyword)}`,
    rank: index + 1,
  }));
}
