import type { TrendItem } from '@/types/trend';

const DAILYHOT_API = 'https://api.dailyhot.com/api/v1';

export async function fetchWeixinvideo(): Promise<TrendItem[]> {
  const response = await fetch(`${DAILYHOT_API}/weixinvideo`, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`DailyHotApi request failed: ${response.status}`);
  }

  const result = await response.json();

  if (!result.data) {
    throw new Error('Invalid DailyHotApi response');
  }

  return result.data.map((item: { title: string; hot: number; url: string; cover?: string }, index: number) => ({
    title: item.title,
    hotValue: item.hot,
    url: item.url,
    thumbnail: item.cover,
    rank: index + 1,
  }));
}
