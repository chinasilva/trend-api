import { fetchTianApi } from './base';
import type { TrendItem } from '@/types/trend';

export async function fetchWeibo(): Promise<TrendItem[]> {
  return fetchTianApi({
    key: process.env.TIANAPI_KEY || '',
    path: '/weibohot/index',
    transform: (data: unknown) => {
      const list = data as Array<{
        hotword: string;
        hotwordnum: string;
        url: string;
        raw_hotword: string;
      }>;
      return list.map((item, index) => ({
        title: item.hotword || item.raw_hotword,
        hotValue: parseInt(item.hotwordnum) || undefined,
        url: item.url,
        rank: index + 1,
      }));
    },
  });
}
