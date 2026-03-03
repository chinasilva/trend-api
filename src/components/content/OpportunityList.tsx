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

function statusTag(status: OpportunityItem['status']) {
  const base = "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border";
  switch (status) {
    case 'NEW':
      return `${base} bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20`;
    case 'SELECTED':
      return `${base} bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20`;
    case 'EXPIRED':
      return `${base} bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700`;
    default:
      return `${base} bg-slate-50 text-slate-400 border-slate-100 dark:bg-slate-900 dark:text-slate-600 dark:border-slate-800`;
  }
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
        <div className="inline-block w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-3"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scanning Opportunities...</p>
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center border-dashed">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No candidates found</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.1em]">Qualified Opportunities</h3>
      </div>
      <div className="p-2 space-y-1">
        {opportunities.map((opportunity) => {
          const isSelected = selectedOpportunityId === opportunity.id;
          const isGenerating = generatingOpportunityId === opportunity.id;
          return (
            <div
              key={opportunity.id}
              className={`group rounded-xl p-4 transition-all border ${
                isSelected
                  ? 'bg-indigo-50/30 border-indigo-100 dark:bg-indigo-500/5 dark:border-indigo-500/20 shadow-sm'
                  : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectOpportunity(opportunity.id)}
                className="w-full text-left focus:outline-none"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={statusTag(opportunity.status)}>{opportunity.status}</span>
                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded uppercase">
                      SCORE: {Math.round(opportunity.score)}
                    </span>
                  </div>
                  <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-tighter">
                    {opportunity.account.name}
                  </span>
                </div>
                <h4 className="text-[13px] font-bold text-slate-900 dark:text-slate-100 mb-3 leading-snug line-clamp-2">
                  {opportunity.topicCluster.title}
                </h4>
                <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-4">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-300">RES:</span>
                    <span className="text-slate-600 dark:text-slate-400">{opportunity.topicCluster.resonanceCount}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-300">GROWTH:</span>
                    <span className="text-slate-600 dark:text-slate-400">+{opportunity.topicCluster.growthScore.toFixed(1)}</span>
                  </div>
                  <div className="ml-auto text-slate-300">{formatDate(opportunity.expiresAt)}</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onGenerateDraft(opportunity.id)}
                disabled={isGenerating}
                className={`w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  isGenerating
                    ? 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 shadow-lg shadow-slate-900/10 dark:shadow-none'
                }`}
              >
                {isGenerating ? 'Synthesizing...' : 'Generate AI Draft'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
