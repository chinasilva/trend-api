'use client';

import type { PublishJobItem } from '@/types/content-ui';

interface PublishJobListProps {
  jobs: PublishJobItem[];
  retryingJobId: string | null;
  onRetry: (jobId: string, allowReview: boolean) => void;
}

function statusDot(status: PublishJobItem['status']) {
  switch (status) {
    case 'SUCCESS': return 'bg-emerald-500';
    case 'FAILED': return 'bg-red-500';
    case 'REVIEW': return 'bg-amber-500';
    case 'RUNNING': return 'bg-indigo-500 animate-pulse';
    default: return 'bg-slate-300';
  }
}

function statusText(status: PublishJobItem['status']) {
  switch (status) {
    case 'SUCCESS': return 'text-emerald-600 dark:text-emerald-400';
    case 'FAILED': return 'text-red-600 dark:text-red-400';
    case 'REVIEW': return 'text-amber-600 dark:text-amber-400';
    case 'RUNNING': return 'text-indigo-600 dark:text-indigo-400';
    default: return 'text-slate-400';
  }
}

export default function PublishJobList({ jobs, retryingJobId, onRetry }: PublishJobListProps) {
  if (jobs.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-center">
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No publishing logs</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Dispatch Status</h3>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
        {jobs.map((job) => {
          const isRetrying = retryingJobId === job.id;
          return (
            <div key={job.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${statusDot(job.status)}`}></div>
                  <span className={`text-[10px] font-black uppercase tracking-tight ${statusText(job.status)}`}>
                    {job.status}
                  </span>
                </div>
                <span className="text-[9px] font-bold text-slate-400 uppercase bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {job.deliveryStage === 'draftbox' ? 'DRAFT' : 'LIVE'}
                </span>
              </div>

              <div className="space-y-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                <div className="flex justify-between">
                  <span>ID: {job.id.slice(0, 8)}...</span>
                  <span>ATTEMPT: {job.attempt}</span>
                </div>
                {job.errorMessage && (
                  <p className="text-red-500 dark:text-red-400 normal-case italic font-medium leading-relaxed">
                    Error: {job.errorMessage}
                  </p>
                )}
              </div>

              {(job.status === 'FAILED' || job.status === 'REVIEW') && (
                <div className="flex gap-2 pt-1">
                  {job.status === 'FAILED' && (
                    <button
                      onClick={() => onRetry(job.id, false)}
                      disabled={isRetrying}
                      className="text-[9px] font-black text-indigo-600 hover:underline uppercase"
                    >
                      {isRetrying ? 'RETRYING...' : 'RETRY NOW'}
                    </button>
                  )}
                  {job.status === 'REVIEW' && (
                    <button
                      onClick={() => onRetry(job.id, true)}
                      disabled={isRetrying}
                      className="text-[9px] font-black text-amber-600 hover:underline uppercase"
                    >
                      {isRetrying ? 'RETRYING...' : 'FORCE RETRY'}
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
