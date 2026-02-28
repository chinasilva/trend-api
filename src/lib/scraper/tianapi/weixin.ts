import { fetchTianApi } from './base';
import type { TrendItem } from '@/types/trend';

export async function fetchWeixin(): Promise<TrendItem[]> {
  return fetchTianApi({
    key: process.env.TIANAPI_KEY || '',
    path: '/wxhottopic/index',
    transform: (data: unknown) => {
      const list = data as Array<{
        word: string;
        index: number | string;
        hotword: string;
        url: string;
        type: string;
      }>;
      return list.map((item, index) => ({
        title: item.word || item.hotword,
        hotValue: Number(item.index) || undefined,
        url: item.url || `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(item.word || item.hotword || '')}`,
        rank: index + 1,
      }));
    },
  });
}
