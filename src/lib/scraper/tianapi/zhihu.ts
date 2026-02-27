import { fetchTianApi } from './base';
import type { TrendItem } from '@/types/trend';

export async function fetchZhihu(): Promise<TrendItem[]> {
  return fetchTianApi({
    key: process.env.TIANAPI_KEY || '',
    path: '/zhihuhot/index',
    transform: (data: unknown) => {
      const list = data as Array<{
        question: string;
        url: string;
        heat: string;
        answer: string;
      }>;
      return list.map((item, index) => ({
        title: item.question,
        hotValue: parseInt(item.heat) || undefined,
        url: item.url,
        description: item.answer,
        rank: index + 1,
      }));
    },
  });
}
