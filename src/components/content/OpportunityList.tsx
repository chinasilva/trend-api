'use client';

import type { OpportunityItem } from '@/types/content-ui';

interface OpportunityListProps {
  opportunities: OpportunityItem[];
  loading: boolean;
  selectedOpportunityId: string | null;
  generatingOpportunityId: string | null;
  onSelectOpportunity: (opportunityId: string) => void;
  onGenerateDraft: (opportunityId: string) => void;
}

function badgeClass(status: OpportunityItem['status']) {
  switch (status) {
    case 'NEW':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200';
    case 'SELECTED':
      return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200';
    case 'EXPIRED':
      return 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300';
    case 'DISCARDED':
      return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300';
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OpportunityList({
  opportunities,
  loading,
  selectedOpportunityId,
  generatingOpportunityId,
  onSelectOpportunity,
  onGenerateDraft,
}: OpportunityListProps) {
  if (loading) {
    return (
      <div className="rounded-3xl border border-black/[0.05] dark:border-white/[0.08] bg-white/70 dark:bg-[#1c1c1e]/70 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        正在加载机会列表...
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="rounded-3xl border border-black/[0.05] dark:border-white/[0.08] bg-white/70 dark:bg-[#1c1c1e]/70 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        暂无机会。请先同步机会，或检查账号/赛道配置。
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-black/[0.05] dark:border-white/[0.08] bg-white/70 dark:bg-[#1c1c1e]/70 p-4 lg:p-5">
      <h3 className="mb-4 text-base font-semibold text-black dark:text-white">机会列表</h3>
      <div className="space-y-3">
        {opportunities.map((opportunity) => {
          const isSelected = selectedOpportunityId === opportunity.id;
          const isGenerating = generatingOpportunityId === opportunity.id;
          return (
            <div
              key={opportunity.id}
              className={`rounded-2xl border p-4 transition-all ${
                isSelected
                  ? 'border-black/25 bg-black/[0.03] dark:border-white/30 dark:bg-white/[0.06]'
                  : 'border-black/[0.06] bg-white/80 dark:border-white/[0.08] dark:bg-[#2a2a2d]/80'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectOpportunity(opportunity.id)}
                className="mb-3 w-full text-left"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(opportunity.status)}`}>
                    {opportunity.status}
                  </span>
                  <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/[0.08] dark:text-gray-300">
                    分数 {Math.round(opportunity.score)}
                  </span>
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{opportunity.account.name}</span>
                </div>
                <p className="line-clamp-2 text-sm font-medium text-black dark:text-white">{opportunity.topicCluster.title}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>共振 {opportunity.topicCluster.resonanceCount}</span>
                  <span>增长 {opportunity.topicCluster.growthScore.toFixed(1)}</span>
                  <span>过期 {formatDate(opportunity.expiresAt)}</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onGenerateDraft(opportunity.id)}
                disabled={isGenerating}
                className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {isGenerating ? '生成中...' : '生成草稿'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
