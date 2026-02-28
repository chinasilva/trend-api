'use client';

import { useState } from 'react';
import DraftPreview from '@/components/content/DraftPreview';
import OpportunityList from '@/components/content/OpportunityList';
import PublishJobList from '@/components/content/PublishJobList';
import {
  generateDraft,
  getDraftDetail,
  listOpportunities,
  publishWechatDraft,
  retryPublishJob,
  syncOpportunities,
} from '@/lib/client/pipeline-api';
import type { DraftDetail, OpportunityItem, OpportunityStatus, Pagination } from '@/types/content-ui';
import { OPPORTUNITY_STATUS_OPTIONS } from '@/types/content-ui';

const DEFAULT_PAGE_SIZE = 12;

interface BannerState {
  type: 'success' | 'error' | 'info';
  text: string;
}

function bannerClass(type: BannerState['type']) {
  if (type === 'success') {
    return 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200';
  }
  if (type === 'error') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200';
  }

  return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200';
}

export default function ContentPipelinePanel() {
  const [apiSecret, setApiSecret] = useState('');
  const [syncSecret, setSyncSecret] = useState('');
  const [windowHours, setWindowHours] = useState(2);

  const [statusFilter, setStatusFilter] = useState<OpportunityStatus>('NEW');
  const [accountIdFilter, setAccountIdFilter] = useState('');
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftDetail | null>(null);

  const [loadingOpportunities, setLoadingOpportunities] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [generatingOpportunityId, setGeneratingOpportunityId] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);

  async function loadOpportunities(page = 1) {
    if (!apiSecret.trim()) {
      setBanner({ type: 'error', text: '请先输入 API 密钥。' });
      return;
    }

    setLoadingOpportunities(true);
    setBanner(null);
    try {
      const result = await listOpportunities(apiSecret.trim(), {
        status: statusFilter,
        accountId: accountIdFilter.trim() || undefined,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      });
      setOpportunities(result.items);
      setPagination(result.pagination);

      if (selectedOpportunityId && !result.items.some((item) => item.id === selectedOpportunityId)) {
        setSelectedOpportunityId(null);
      }
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '加载机会列表失败。',
      });
    } finally {
      setLoadingOpportunities(false);
    }
  }

  async function handleSync() {
    const trimmedSyncSecret = syncSecret.trim();
    if (!trimmedSyncSecret) {
      setBanner({ type: 'error', text: '请先输入同步密钥 PIPELINE_SYNC_SECRET。' });
      return;
    }

    setSyncing(true);
    setBanner(null);
    try {
      const result = await syncOpportunities(trimmedSyncSecret, windowHours);
      setBanner({
        type: 'success',
        text: `同步完成：聚类 ${result.clustersUpserted}，机会 ${result.opportunitiesUpserted}。`,
      });
      await loadOpportunities(1);
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '同步机会失败。',
      });
    } finally {
      setSyncing(false);
    }
  }

  async function loadDraft(draftId: string) {
    if (!apiSecret.trim()) {
      setBanner({ type: 'error', text: '请先输入 API 密钥。' });
      return;
    }

    setLoadingDraft(true);
    try {
      const data = await getDraftDetail(apiSecret.trim(), draftId);
      setDraft(data);
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '加载草稿详情失败。',
      });
    } finally {
      setLoadingDraft(false);
    }
  }

  async function handleGenerate(opportunityId: string) {
    if (!apiSecret.trim()) {
      setBanner({ type: 'error', text: '请先输入 API 密钥。' });
      return;
    }

    setGeneratingOpportunityId(opportunityId);
    setSelectedOpportunityId(opportunityId);
    setBanner(null);
    try {
      const generated = await generateDraft(apiSecret.trim(), opportunityId);
      await loadDraft(generated.draftId);
      setBanner({ type: 'success', text: `草稿已生成：${generated.title}` });
      await loadOpportunities(pagination?.page || 1);
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '生成草稿失败。',
      });
    } finally {
      setGeneratingOpportunityId(null);
    }
  }

  async function handlePublish() {
    if (!draft) {
      setBanner({ type: 'error', text: '请先生成草稿。' });
      return;
    }

    if (!apiSecret.trim()) {
      setBanner({ type: 'error', text: '请先输入 API 密钥。' });
      return;
    }

    setPublishing(true);
    setBanner(null);
    try {
      const result = await publishWechatDraft(apiSecret.trim(), draft.id, true);
      await loadDraft(draft.id);
      setBanner({
        type: 'success',
        text:
          result.deliveryStage === 'draftbox'
            ? '发布任务成功，内容已提交到公众号草稿箱。'
            : '发布任务成功，内容已发布。',
      });
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '提交发布任务失败。',
      });
    } finally {
      setPublishing(false);
    }
  }

  async function handleRetry(jobId: string, allowReview: boolean) {
    if (!apiSecret.trim()) {
      setBanner({ type: 'error', text: '请先输入 API 密钥。' });
      return;
    }

    if (!draft) {
      setBanner({ type: 'error', text: '当前没有可重试的草稿。' });
      return;
    }

    setRetryingJobId(jobId);
    setBanner(null);
    try {
      const result = await retryPublishJob(apiSecret.trim(), jobId, allowReview);
      await loadDraft(draft.id);
      setBanner({
        type: 'success',
        text: `重试完成：${result.status} (${result.deliveryStage})`,
      });
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '重试失败。',
      });
    } finally {
      setRetryingJobId(null);
    }
  }

  async function handleCopy() {
    if (!draft?.content) {
      return;
    }

    try {
      await navigator.clipboard.writeText(draft.content);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setBanner({ type: 'error', text: '复制失败，请手工复制内容。' });
    }
  }

  return (
    <section className="mx-auto max-w-[1440px]">
      <div className="rounded-[2.5rem] border border-black/[0.05] bg-white/75 p-6 shadow-[0_8px_40px_rgb(0,0,0,0.04)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-[#1c1c1e]/75 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-black dark:text-white">内容生产操作台</h2>
          <button
            type="button"
            onClick={() => void loadOpportunities(1)}
            disabled={loadingOpportunities}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
          >
            {loadingOpportunities ? '加载中...' : '刷新机会'}
          </button>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="password"
            value={apiSecret}
            onChange={(event) => setApiSecret(event.target.value)}
            placeholder="PIPELINE_API_SECRET"
            className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
          />
          <input
            type="password"
            value={syncSecret}
            onChange={(event) => setSyncSecret(event.target.value)}
            placeholder="PIPELINE_SYNC_SECRET"
            className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
          />
          <input
            type="number"
            min={1}
            max={24}
            value={windowHours}
            onChange={(event) => setWindowHours(Math.min(24, Math.max(1, Number(event.target.value) || 2)))}
            className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as OpportunityStatus)}
            className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
          >
            {OPPORTUNITY_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="text"
              value={accountIdFilter}
              onChange={(event) => setAccountIdFilter(event.target.value)}
              placeholder="accountId（可选）"
              className="min-w-0 flex-1 rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
            />
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing}
              className="rounded-2xl bg-black px-4 py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {syncing ? '同步中' : '同步机会'}
            </button>
          </div>
        </div>

        {banner && (
          <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-medium ${bannerClass(banner.type)}`}>
            {banner.text}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <OpportunityList
              opportunities={opportunities}
              loading={loadingOpportunities}
              selectedOpportunityId={selectedOpportunityId}
              generatingOpportunityId={generatingOpportunityId}
              onSelectOpportunity={setSelectedOpportunityId}
              onGenerateDraft={(id) => {
                void handleGenerate(id);
              }}
            />

            {pagination && (
              <div className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-white/80 px-4 py-3 text-xs text-gray-600 dark:border-white/[0.08] dark:bg-[#2a2a2d]/80 dark:text-gray-300">
                <span>
                  第 {pagination.page} / {Math.max(1, pagination.totalPages)} 页（共 {pagination.total} 条）
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void loadOpportunities(pagination.page - 1)}
                    disabled={!pagination.hasPrev || loadingOpportunities}
                    className="rounded-full border border-black/10 px-3 py-1 font-semibold text-black transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-white dark:hover:bg-white/[0.06]"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadOpportunities(pagination.page + 1)}
                    disabled={!pagination.hasNext || loadingOpportunities}
                    className="rounded-full border border-black/10 px-3 py-1 font-semibold text-black transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-white dark:hover:bg-white/[0.06]"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <DraftPreview
              draft={draft}
              loading={loadingDraft}
              publishing={publishing}
              copied={copied}
              onCopy={() => {
                void handleCopy();
              }}
              onPublish={() => {
                void handlePublish();
              }}
            />
            <PublishJobList
              jobs={draft?.publishJobs || []}
              retryingJobId={retryingJobId}
              onRetry={(jobId, allowReview) => {
                void handleRetry(jobId, allowReview);
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
