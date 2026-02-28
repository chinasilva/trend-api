'use client';

import type { PublishJobItem } from '@/types/content-ui';

interface PublishJobListProps {
  jobs: PublishJobItem[];
  retryingJobId: string | null;
  onRetry: (jobId: string, allowReview: boolean) => void;
}

function statusClass(status: PublishJobItem['status']) {
  switch (status) {
    case 'SUCCESS':
      return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200';
    case 'FAILED':
      return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200';
    case 'REVIEW':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200';
    case 'RUNNING':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300';
  }
}

export default function PublishJobList({ jobs, retryingJobId, onRetry }: PublishJobListProps) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-3xl border border-black/[0.05] bg-white/70 p-5 text-sm text-gray-500 dark:border-white/[0.08] dark:bg-[#1c1c1e]/70 dark:text-gray-400">
        暂无发布任务记录。
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-black/[0.05] bg-white/70 p-4 dark:border-white/[0.08] dark:bg-[#1c1c1e]/70">
      <h3 className="mb-3 text-base font-semibold text-black dark:text-white">发布任务</h3>
      <div className="space-y-3">
        {jobs.map((job) => {
          const isRetrying = retryingJobId === job.id;
          const canRetry = job.status === 'FAILED';
          const canForceRetry = job.status === 'REVIEW';

          return (
            <div
              key={job.id}
              className="rounded-2xl border border-black/[0.06] bg-white/80 p-4 dark:border-white/[0.08] dark:bg-[#2a2a2d]/80"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(job.status)}`}>
                  {job.status}
                </span>
                <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/[0.08] dark:text-gray-300">
                  {job.deliveryStage === 'draftbox' ? '草稿箱' : '已发布'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">尝试 {job.attempt}</span>
              </div>

              <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                <p>任务ID: {job.id}</p>
                {job.externalId && <p>外部ID: {job.externalId}</p>}
                {job.errorMessage && <p className="text-red-500 dark:text-red-400">错误: {job.errorMessage}</p>}
              </div>

              {(canRetry || canForceRetry) && (
                <div className="mt-3 flex gap-2">
                  {canRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(job.id, false)}
                      disabled={isRetrying}
                      className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-white dark:hover:bg-white/[0.06]"
                    >
                      {isRetrying ? '重试中...' : '重试'}
                    </button>
                  )}
                  {canForceRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(job.id, true)}
                      disabled={isRetrying}
                      className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
                    >
                      {isRetrying ? '处理中...' : '复核后重试'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
