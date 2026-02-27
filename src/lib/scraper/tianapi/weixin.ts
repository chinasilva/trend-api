import { fetchTianApi } from './base';
import type { TrendItem } from '@/types/trend';

export async function fetchWeixin(): Promise<TrendItem[]> {
  return fetchTianApi({
    key: process.env.TIANAPI_KEY || '',
    path: '/weixinhot/index',
    transform: (data: unknown) => {
      const list = data as Array<{
        hotword: string;
        url: string;
        type: string;
      }>;
      return list.map((item, index) => ({
        title: item.hotword,
        url: item.url,
        rank: index + 1,
      }));
    },
  });
}
