'use client';

import { TrendItem, Platform, PLATFORM_CONFIGS } from '@/types/trend';

interface TrendListProps {
  trends: TrendItem[];
  platform: Platform;
}

function formatHotValue(value?: number): string {
  if (!value) return '';
  if (value >= 100000000) {
    return (value / 100000000).toFixed(1) + '亿';
  }
  if (value >= 10000) {
    return (value / 10000).toFixed(1) + '万';
  }
  return value.toString();
}

export default function TrendList({ trends, platform }: TrendListProps) {
  const config = PLATFORM_CONFIGS[platform];

  if (trends.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        暂无数据
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <span className="text-xl">{config.icon}</span>
        <span className="font-semibold text-gray-900 dark:text-gray-100">{config.name}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">热榜</span>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {trends.map((item) => (
          <a
            key={item.rank}
            href={item.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
          >
            <span
              className={`flex-shrink-0 w-7 h-7 flex items-center justify-center text-sm font-medium rounded ${
                item.rank <= 3
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {item.rank}
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {item.title}
              </h3>
              {item.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                  {item.description}
                </p>
              )}
            </div>
            {item.hotValue && (
              <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
                {formatHotValue(item.hotValue)}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
