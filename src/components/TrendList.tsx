'use client';

import { TrendItem, Platform, PLATFORM_CONFIGS } from '@/types/trend';

interface TrendListProps {
  trends: TrendItem[];
  platform: Platform;
}

const DISPLAY_TREND_COUNT = 50;
const HOT_VALUE_HIDDEN_PLATFORMS = new Set<Platform>(['weixin', 'weixinvideo']);

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

function shouldHideHotValues(platform: Platform) {
  return HOT_VALUE_HIDDEN_PLATFORMS.has(platform);
}

export default function TrendList({ trends, platform }: TrendListProps) {
  const config = PLATFORM_CONFIGS[platform];
  const displayTrends = trends.slice(0, DISPLAY_TREND_COUNT);
  const hasVisibleData = displayTrends.length > 0;
  const hideHotValues = shouldHideHotValues(platform);
  const slots = Array.from({ length: DISPLAY_TREND_COUNT }, (_, index) => ({
    displayRank: index + 1,
    item: displayTrends[index] ?? null,
  }));

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300"
      aria-label={`${config.name} 趋势列表，当前 ${displayTrends.length} 条有效数据，按 ${DISPLAY_TREND_COUNT} 个槽位展示`}
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <span className="text-xl filter drop-shadow-sm">{config.icon}</span>
        <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight text-base leading-none">{config.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-sm uppercase">
            实时榜单
          </span>
          <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-sm uppercase">
            {Math.min(trends.length, DISPLAY_TREND_COUNT)}/{DISPLAY_TREND_COUNT}
          </span>
          {!hasVisibleData ? (
            <span className="text-[10px] font-bold tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-sm uppercase">
              暂无数据
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col divide-y divide-slate-50 dark:divide-slate-800/50">
        {slots.map(({ displayRank, item }) => {
          const rankClass = displayRank === 1
            ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-500/20'
            : displayRank <= 3
            ? 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-100 dark:border-slate-700/50'
            : 'text-slate-400 dark:text-slate-500';

          if (!item) {
            return (
              <div
                key={`${platform}-placeholder-${displayRank}`}
                aria-hidden="true"
                className="flex min-h-[74px] items-start gap-4 px-4 py-3.5 bg-white dark:bg-slate-900"
              >
                <div
                  className={`flex-shrink-0 w-7 h-7 flex items-center justify-center text-[13px] font-bold rounded-md tabular-nums border border-transparent ${rankClass} opacity-45`}
                >
                  {displayRank}
                </div>
                <div className="flex-1 min-w-0 flex flex-col pt-0.5">
                  <div className="h-4 w-[68%] rounded bg-slate-100 dark:bg-slate-800/80" />
                  <div className="mt-2 h-[18px] w-[42%] rounded bg-slate-50 dark:bg-slate-800/50" />
                </div>
                <div className="flex-shrink-0 flex items-center pt-1">
                  <div className="h-5 w-11 rounded border border-slate-100 bg-slate-50 dark:border-slate-700/50 dark:bg-slate-800/50" />
                </div>
              </div>
            );
          }

          const hotValueLabel = hideHotValues ? '' : formatHotValue(item.hotValue);
          const content = (
            <>
              <div
                className={`flex-shrink-0 w-7 h-7 flex items-center justify-center text-[13px] font-bold rounded-md tabular-nums transition-colors ${rankClass}`}
              >
                {displayRank}
              </div>
              <div className="flex-1 min-w-0 flex flex-col pt-0.5">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 leading-snug truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {item.title}
                </h3>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 min-h-[18px] line-clamp-1 leading-relaxed opacity-90">
                  {item.description || ''}
                </p>
              </div>
              <div className="flex-shrink-0 flex w-[52px] justify-end items-center pt-1">
                {hotValueLabel ? (
                  <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 tabular-nums bg-slate-50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700/50">
                    {hotValueLabel}
                  </span>
                ) : (
                  <span className="block h-5 w-11" aria-hidden="true" />
                )}
              </div>
            </>
          );

          if (!item.url) {
            return (
              <div
                key={`${platform}-${displayRank}-${item.rank}-${item.title}`}
                className="flex min-h-[74px] items-start gap-4 px-4 py-3.5 transition-colors group"
              >
                {content}
              </div>
            );
          }

          return (
            <a
              key={`${platform}-${displayRank}-${item.rank}-${item.url}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[74px] items-start gap-4 px-4 py-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
            >
              {content}
            </a>
          );
        })}
      </div>
    </div>
  );
}
