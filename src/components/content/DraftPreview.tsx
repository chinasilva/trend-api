'use client';

import type { DraftDetail } from '@/types/content-ui';

interface DraftPreviewProps {
  draft: DraftDetail | null;
  loading: boolean;
  publishing: boolean;
  copied: boolean;
  onCopy: () => void;
  onPublish: () => void;
}

function statusBadgeClass(status: DraftDetail['status']) {
  switch (status) {
    case 'READY':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200';
    case 'REVIEW':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200';
    case 'BLOCKED':
      return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200';
    case 'SUBMITTED':
      return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200';
    case 'PUBLISHED':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300';
  }
}

function statusHint(status: DraftDetail['status']) {
  if (status === 'SUBMITTED') {
    return '已提交到公众号草稿箱，待人工发布。';
  }
  if (status === 'PUBLISHED') {
    return '已发布。';
  }
  if (status === 'REVIEW') {
    return '当前草稿需要人工复核。';
  }
  if (status === 'BLOCKED') {
    return '当前草稿被风控阻断，不可发布。';
  }
  return '可提交发布任务。';
}

export default function DraftPreview({
  draft,
  loading,
  publishing,
  copied,
  onCopy,
  onPublish,
}: DraftPreviewProps) {
  if (loading) {
    return (
      <div className="rounded-3xl border border-black/[0.05] bg-white/70 p-8 text-center text-sm text-gray-500 dark:border-white/[0.08] dark:bg-[#1c1c1e]/70 dark:text-gray-400">
        正在加载草稿...
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="rounded-3xl border border-black/[0.05] bg-white/70 p-8 text-center text-sm text-gray-500 dark:border-white/[0.08] dark:bg-[#1c1c1e]/70 dark:text-gray-400">
        选择机会后点击“生成草稿”，这里会显示正文与发布状态。
      </div>
    );
  }

  const publishDisabled =
    publishing ||
    draft.status === 'BLOCKED' ||
    draft.status === 'REVIEW' ||
    draft.status === 'SUBMITTED' ||
    draft.status === 'PUBLISHED';

  return (
    <div className="rounded-3xl border border-black/[0.05] bg-white/80 p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#1c1c1e]/80">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(draft.status)}`}>
          {draft.status}
        </span>
        <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/[0.08] dark:text-gray-300">
          风险 {draft.riskLevel}
        </span>
        <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/[0.08] dark:text-gray-300">
          模型 {draft.model}
        </span>
      </div>

      <h3 className="mb-2 text-lg font-semibold text-black dark:text-white">{draft.title}</h3>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{statusHint(draft.status)}</p>

      <div className="mb-4 rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-sm leading-6 text-gray-800 dark:text-gray-200">
          {draft.content}
        </pre>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-black/[0.03] dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
        >
          {copied ? '已复制' : '复制正文'}
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={publishDisabled}
          className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {publishing ? '提交中...' : '提交发布任务'}
        </button>
      </div>
    </div>
  );
}
