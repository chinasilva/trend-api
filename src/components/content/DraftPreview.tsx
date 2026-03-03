'use client';

import type { DraftDetail } from '@/types/content-ui';

interface DraftPreviewProps {
  draft: DraftDetail | null;
  loading: boolean;
  publishing: boolean;
  regenerating: boolean;
  planningAssets: boolean;
  copied: boolean;
  onCopy: () => void;
  onPublish: () => void;
  onRegenerate: () => void;
  onPlanAssets: () => void;
}

function statusTag(status: DraftDetail['status']) {
  const base = "text-[9px] font-black px-1.5 py-0.5 rounded uppercase border";
  switch (status) {
    case 'READY':
      return `${base} bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20`;
    case 'REVIEW':
      return `${base} bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20`;
    case 'BLOCKED':
      return `${base} bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20`;
    case 'SUBMITTED':
      return `${base} bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20`;
    case 'PUBLISHED':
      return `${base} bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white`;
    default:
      return `${base} bg-slate-50 text-slate-400 border-slate-100 dark:bg-slate-900 dark:text-slate-600 dark:border-slate-800`;
  }
}

export default function DraftPreview({
  draft,
  loading,
  publishing,
  regenerating,
  planningAssets,
  copied,
  onCopy,
  onPublish,
  onRegenerate,
  onPlanAssets,
}: DraftPreviewProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center h-full flex flex-col items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-3"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Compiling Draft...</p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center h-full flex flex-col items-center justify-center border-dashed">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-loose max-w-[200px]">
          Select an opportunity to generate AI content
        </p>
      </div>
    );
  }

  const publishDisabled = publishing || ['BLOCKED', 'REVIEW', 'SUBMITTED', 'PUBLISHED'].includes(draft.status);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={statusTag(draft.status)}>{draft.status}</span>
          <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded uppercase">
            RISK: {draft.riskLevel}
          </span>
        </div>
        <div className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase">
          MODEL: {draft.model}
        </div>
      </div>

      <div className="p-6 flex-1 overflow-auto bg-slate-50/20 dark:bg-slate-950/20">
        <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white mb-6 leading-tight">
          {draft.title}
        </h3>

        {draft.contentPack && (
          <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-[11px] font-medium text-slate-600 dark:text-slate-400 space-y-2">
            <p><span className="font-black text-slate-400 dark:text-slate-500 uppercase mr-2 text-[9px]">Angle:</span> {draft.contentPack.coreAngle}</p>
            <p><span className="font-black text-slate-400 dark:text-slate-500 uppercase mr-2 text-[9px]">Target:</span> {draft.contentPack.targetReader}</p>
          </div>
        )}

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 font-sans border-none bg-transparent p-0 m-0">
            {draft.content}
          </pre>
        </div>

        {draft.imagePlaceholders && draft.imagePlaceholders.length > 0 && (
          <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Visual Assets</h4>
            <div className="space-y-4">
              {draft.imagePlaceholders.map((item) => (
                <div key={item.slot} className="p-3 rounded-lg bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-indigo-500 uppercase">Slot #{item.slot}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">{item.placementAnchor}</span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 line-clamp-1 mb-1">{item.purpose}</p>
                  <p className="text-[10px] text-slate-400 leading-normal italic">{item.prompt}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <button
          onClick={onCopy}
          className="px-3 py-2 bg-slate-50 dark:bg-slate-800 text-[10px] font-black rounded-lg hover:bg-slate-100 transition-colors uppercase border border-slate-200 dark:border-slate-700"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          className="px-3 py-2 bg-slate-50 dark:bg-slate-800 text-[10px] font-black rounded-lg hover:bg-slate-100 transition-colors uppercase border border-slate-200 dark:border-slate-700"
        >
          {regenerating ? 'Retrying...' : 'Regenerate'}
        </button>
        <button
          onClick={onPlanAssets}
          disabled={planningAssets}
          className="px-3 py-2 bg-slate-50 dark:bg-slate-800 text-[10px] font-black rounded-lg hover:bg-slate-100 transition-colors uppercase border border-slate-200 dark:border-slate-700"
        >
          {planningAssets ? 'Planning...' : 'Visuals'}
        </button>
        <button
          onClick={onPublish}
          disabled={publishDisabled}
          className="col-span-2 sm:col-span-1 px-4 py-2 bg-indigo-600 text-white text-[10px] font-black rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20 uppercase"
        >
          {publishing ? 'Submitting...' : 'Submit to WeChat'}
        </button>
      </div>
    </div>
  );
}
