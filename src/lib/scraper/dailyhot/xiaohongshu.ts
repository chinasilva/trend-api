import type { TrendItem } from '@/types/trend';

const TIKHUB_API = 'https://api.tikhub.io/api/v1/xiaohongshu/web_v2/fetch_hot_list';

export async function fetchXiaohongshu(): Promise<TrendItem[]> {
  const apiKey = process.env.TIKHUB_API_KEY;

  if (!apiKey) {
    throw new Error('TIKHUB_API_KEY is not configured');
  }

  const response = await fetch(TIKHUB_API, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`TikHub API request failed: ${response.status}`);
  }

  const result = await response.json();

  if (!result.data || !Array.isArray(result.data)) {
    throw new Error('Invalid TikHub API response');
  }

  return result.data.map((item: { title: string; hot_value: number; note_id: string; cover?: { url: string } }, index: number) => ({
    title: item.title,
    hotValue: item.hot_value,
    url: `https://www.xiaohongshu.com/explore/${item.note_id}`,
    thumbnail: item.cover?.url,
    rank: index + 1,
  }));
}
