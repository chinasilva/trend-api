import { fetchTianApi } from './base';
import type { TrendItem } from '@/types/trend';

export async function fetchBaidu(): Promise<TrendItem[]> {
  return fetchTianApi({
    key: process.env.TIANAPI_KEY || '',
    path: '/baiduhot/index',
    transform: (data: unknown) => {
      const list = data as Array<{
        hotword: string;
        hotwordnum: string;
        url: string;
      }>;
      return list.map((item, index) => ({
        title: item.hotword,
        hotValue: parseInt(item.hotwordnum) || undefined,
        url: item.url,
        rank: index + 1,
      }));
    },
  });
}
