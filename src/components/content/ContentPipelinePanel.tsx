'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DraftPreview from '@/components/content/DraftPreview';
import OpportunityList from '@/components/content/OpportunityList';
import PublishJobList from '@/components/content/PublishJobList';
import {
  fetchPipelineSession,
  loginPipeline,
  logoutPipeline,
  SESSION_AUTH_PLACEHOLDER,
} from '@/lib/client/pipeline-auth';
import {
  generateDraft,
  getAccountProfile,
  getDraftDetail,
  listAccounts,
  listOpportunities,
  planDraftAssets,
  publishWechatDraft,
  regenerateDraft,
  retryPublishJob,
  rollbackAccountProfile,
  syncOpportunities,
  updateAccountProfile,
} from '@/lib/client/pipeline-api';
import type {
  AccountProfileInput,
  OpportunityItem,
  OpportunityStatus,
  Pagination,
} from '@/types/content-ui';
import type { AccountProfileVersionItem, DraftDetail } from '@/types/content-ui';
import { OPPORTUNITY_STATUS_OPTIONS } from '@/types/content-ui';

const DEFAULT_PAGE_SIZE = 12;

interface BannerState {
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ProfileFormState {
  audience: string;
  tone: string;
  growthGoal: string;
  painPoints: string;
  contentPromise: string;
  forbiddenTopics: string;
  ctaStyle: string;
  preferredLength: number;
}

const EMPTY_PROFILE: ProfileFormState = {
  audience: '',
  tone: '',
  growthGoal: 'read',
  painPoints: '',
  contentPromise: '',
  forbiddenTopics: '',
  ctaStyle: '',
  preferredLength: 1800,
};

function bannerClass(type: BannerState['type']) {
  if (type === 'success') {
    return 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200';
  }
  if (type === 'error') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200';
  }

  return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200';
}

function toCsv(values: string[] | undefined) {
  if (!values || values.length === 0) {
    return '';
  }

  return values.join('；');
}

function splitList(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[；;，,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function mapProfileForm(input: AccountProfileInput): ProfileFormState {
  return {
    audience: input.audience,
    tone: input.tone,
    growthGoal: input.growthGoal,
    painPoints: toCsv(input.painPoints),
    contentPromise: input.contentPromise || '',
    forbiddenTopics: toCsv(input.forbiddenTopics),
    ctaStyle: input.ctaStyle || '',
    preferredLength: input.preferredLength,
  };
}

function buildProfilePayload(form: ProfileFormState): AccountProfileInput {
  return {
    audience: form.audience.trim(),
    tone: form.tone.trim(),
    growthGoal: form.growthGoal.trim() || 'read',
    painPoints: splitList(form.painPoints),
    contentPromise: form.contentPromise.trim() || undefined,
    forbiddenTopics: splitList(form.forbiddenTopics),
    ctaStyle: form.ctaStyle.trim() || undefined,
    preferredLength: Math.min(3000, Math.max(800, Math.round(form.preferredLength || 1800))),
  };
}

function formatTime(value: string) {
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

export default function ContentPipelinePanel() {
  const [apiSecret, setApiSecret] = useState('');
  const [syncSecret, setSyncSecret] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authChecking, setAuthChecking] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState(2);

  const [statusFilter, setStatusFilter] = useState<OpportunityStatus>('NEW');
  const [accountIdFilter, setAccountIdFilter] = useState('');
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; platform: string }>>([]);

  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [draft, setDraft] = useState<DraftDetail | null>(null);

  const [profileForm, setProfileForm] = useState<ProfileFormState>(EMPTY_PROFILE);
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<string>('');
  const [profileVersions, setProfileVersions] = useState<AccountProfileVersionItem[]>([]);

  const [loadingOpportunities, setLoadingOpportunities] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [generatingOpportunityId, setGeneratingOpportunityId] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [planningAssets, setPlanningAssets] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [rollingBackVersionId, setRollingBackVersionId] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);

  const loadSession = useCallback(async () => {
    setAuthChecking(true);
    try {
      const session = await fetchPipelineSession();
      if (session.authenticated) {
        setAuthUser(session.username || 'admin');
        setApiSecret(SESSION_AUTH_PLACEHOLDER);
        setSyncSecret(SESSION_AUTH_PLACEHOLDER);
      } else {
        setAuthUser(null);
        setApiSecret('');
        setSyncSecret('');
      }
    } catch (error) {
      setAuthUser(null);
      setApiSecret('');
      setSyncSecret('');
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '登录状态校验失败。',
      });
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const selectedOpportunity = useMemo(
    () => opportunities.find((item) => item.id === selectedOpportunityId) || null,
    [opportunities, selectedOpportunityId]
  );

  const loadAccounts = useCallback(async () => {
    if (!apiSecret.trim()) {
      return;
    }

    try {
      const items = await listAccounts(apiSecret.trim());
      setAccounts(items);

      if (!selectedAccountId && items.length > 0) {
        setSelectedAccountId(items[0].id);
      }

      if (items.length === 0) {
        setBanner({
          type: 'info',
          text: '当前没有可用账号。请先前往账号定位设置页创建账号，再返回本页继续内容生产。',
        });
      }
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '加载账号列表失败。',
      });
    }
  }, [apiSecret, selectedAccountId]);

  const loadProfile = useCallback(async (accountId: string) => {
    if (!apiSecret.trim() || !accountId) {
      return;
    }

    setLoadingProfile(true);
    try {
      const result = await getAccountProfile(apiSecret.trim(), accountId);
      setProfileForm(mapProfileForm(result.profile));
      setProfileUpdatedAt(result.profile.updatedAt);
      setProfileVersions(result.versions);
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '加载账号定位失败。',
      });
    } finally {
      setLoadingProfile(false);
    }
  }, [apiSecret]);

  useEffect(() => {
    if (!apiSecret.trim() || !selectedAccountId) {
      return;
    }

    void loadProfile(selectedAccountId);
  }, [apiSecret, selectedAccountId, loadProfile]);

  useEffect(() => {
    if (!apiSecret.trim()) {
      return;
    }

    void loadAccounts();
  }, [apiSecret, loadAccounts]);

  async function handleLogin() {
    const username = loginUsername.trim();
    if (!username || !loginPassword) {
      setBanner({ type: 'error', text: '请输入账号和密码。' });
      return;
    }

    setAuthSubmitting(true);
    setBanner(null);
    try {
      const session = await loginPipeline(username, loginPassword);
      setAuthUser(session.username || username);
      setApiSecret(SESSION_AUTH_PLACEHOLDER);
      setSyncSecret(SESSION_AUTH_PLACEHOLDER);
      setLoginPassword('');
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '登录失败。',
      });
      setAuthUser(null);
      setApiSecret('');
      setSyncSecret('');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    setAuthSubmitting(true);
    setBanner(null);
    try {
      await logoutPipeline();
      setAuthUser(null);
      setApiSecret('');
      setSyncSecret('');
      setAccounts([]);
      setOpportunities([]);
      setSelectedOpportunityId(null);
      setSelectedAccountId('');
      setDraft(null);
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '退出登录失败。',
      });
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function loadOpportunities(page = 1) {
    if (!apiSecret.trim()) {
      setBanner({ type: 'error', text: '请先登录。' });
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
      await loadAccounts();

      if (selectedOpportunityId && !result.items.some((item) => item.id === selectedOpportunityId)) {
        setSelectedOpportunityId(null);
      }

      if (!selectedOpportunityId && result.items.length > 0) {
        setSelectedOpportunityId(result.items[0].id);
        setSelectedAccountId(result.items[0].accountId);
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
      setBanner({ type: 'error', text: '请先登录。' });
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
      setBanner({ type: 'error', text: '请先登录。' });
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
      setBanner({ type: 'error', text: '请先登录。' });
      return;
    }

    setGeneratingOpportunityId(opportunityId);
    setSelectedOpportunityId(opportunityId);
    setBanner(null);
    try {
      const generated = await generateDraft(apiSecret.trim(), opportunityId, {
        profileOverride: buildProfilePayload(profileForm),
      });
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

  async function handleRegenerate() {
    if (!draft || !apiSecret.trim()) {
      setBanner({ type: 'error', text: '请先登录并生成草稿。' });
      return;
    }

    setRegenerating(true);
    setBanner(null);
    try {
      const generated = await regenerateDraft(apiSecret.trim(), draft.id);
      await loadDraft(generated.draftId);
      setBanner({ type: 'success', text: `已生成新稿：${generated.title}` });
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '重新生成失败。',
      });
    } finally {
      setRegenerating(false);
    }
  }

  async function handlePlanAssets() {
    if (!draft || !apiSecret.trim()) {
      setBanner({ type: 'error', text: '请先登录并生成草稿。' });
      return;
    }

    setPlanningAssets(true);
    setBanner(null);
    try {
      const result = await planDraftAssets(apiSecret.trim(), draft.id, {
        imageCount: 4,
        stylePreset: 'news-analysis',
      });
      await loadDraft(draft.id);
      setBanner({ type: 'success', text: `已生成图片占位 ${result.imagePlan.length} 条。` });
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '生成图片占位失败。',
      });
    } finally {
      setPlanningAssets(false);
    }
  }

  async function handlePublish() {
    if (!draft) {
      setBanner({ type: 'error', text: '请先生成草稿。' });
      return;
    }

    if (!apiSecret.trim()) {
      setBanner({ type: 'error', text: '请先登录。' });
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
      setBanner({ type: 'error', text: '请先登录。' });
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

  async function handleSaveProfile() {
    if (!apiSecret.trim() || !selectedAccountId) {
      setBanner({ type: 'error', text: '请先登录并选择账号。' });
      return;
    }

    setSavingProfile(true);
    setBanner(null);
    try {
      const result = await updateAccountProfile(
        apiSecret.trim(),
        selectedAccountId,
        buildProfilePayload(profileForm)
      );
      setProfileForm(mapProfileForm(result.profile));
      setProfileVersions(result.versions);
      setProfileUpdatedAt(result.profile.updatedAt);
      setBanner({ type: 'success', text: '账号定位已保存并全局生效。' });
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '保存账号定位失败。',
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleRollback(versionId: string) {
    if (!apiSecret.trim() || !selectedAccountId) {
      setBanner({ type: 'error', text: '请先登录并选择账号。' });
      return;
    }

    setRollingBackVersionId(versionId);
    setBanner(null);
    try {
      const result = await rollbackAccountProfile(apiSecret.trim(), selectedAccountId, versionId);
      setProfileForm(mapProfileForm(result.profile));
      setProfileVersions(result.versions);
      setProfileUpdatedAt(result.profile.updatedAt);
      setBanner({ type: 'success', text: '已回滚并保存为当前版本。' });
    } catch (error) {
      setBanner({
        type: 'error',
        text: error instanceof Error ? error.message : '回滚账号定位失败。',
      });
    } finally {
      setRollingBackVersionId(null);
    }
  }

  function handleSelectOpportunity(opportunityId: string) {
    setSelectedOpportunityId(opportunityId);
    const picked = opportunities.find((item) => item.id === opportunityId);
    if (picked) {
      setSelectedAccountId(picked.accountId);
    }
  }

  if (authChecking) {
    return (
      <section className="mx-auto max-w-[1440px]">
        <div className="rounded-[2.5rem] border border-black/[0.05] bg-white/75 p-6 text-sm text-gray-600 shadow-[0_8px_40px_rgb(0,0,0,0.04)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-[#1c1c1e]/75 dark:text-gray-300 lg:p-8">
          正在校验登录状态...
        </div>
      </section>
    );
  }

  if (!authUser) {
    return (
      <section className="mx-auto max-w-[1440px]">
        <div className="rounded-[2.5rem] border border-black/[0.05] bg-white/75 p-6 shadow-[0_8px_40px_rgb(0,0,0,0.04)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-[#1c1c1e]/75 lg:p-8">
          <h2 className="mb-3 text-2xl font-semibold tracking-tight text-black dark:text-white">
            内容生产操作台登录
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">登录后可同步机会、生成草稿并发布。</p>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={loginUsername}
              onChange={(event) => setLoginUsername(event.target.value)}
              placeholder="登录账号"
              className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
            />
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="登录密码"
              className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleLogin();
                }
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => void handleLogin()}
            disabled={authSubmitting}
            className="mt-4 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {authSubmitting ? '登录中...' : '登录'}
          </button>
          {banner && (
            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-medium ${bannerClass(banner.type)}`}>
              {banner.text}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1440px]">
      <div className="rounded-[2.5rem] border border-black/[0.05] bg-white/75 p-6 shadow-[0_8px_40px_rgb(0,0,0,0.04)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-[#1c1c1e]/75 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-black dark:text-white">内容生产操作台</h2>
          <div className="flex items-center gap-2">
            <Link
              href="/accounts/settings"
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-black/[0.03] dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
            >
              账号设置页
            </Link>
            <button
              type="button"
              onClick={() => void loadOpportunities(1)}
              disabled={loadingOpportunities}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
            >
              {loadingOpportunities ? '加载中...' : '刷新机会'}
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={authSubmitting}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
            >
              {authSubmitting ? '退出中...' : `退出登录（${authUser}）`}
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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

        <div className="mb-5 rounded-3xl border border-black/[0.05] bg-white/70 p-4 dark:border-white/[0.08] dark:bg-[#1c1c1e]/70">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-black dark:text-white">账号定位（全局生效）</h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>更新时间：{profileUpdatedAt ? formatTime(profileUpdatedAt) : '-'}</span>
              {loadingProfile && <span>加载中...</span>}
            </div>
          </div>

          <div className="mb-3 grid gap-3 md:grid-cols-3">
            <select
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
            >
              <option value="">选择账号</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.platform})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={profileForm.growthGoal}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, growthGoal: event.target.value }))}
              placeholder="增长目标"
              className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
            />
            <input
              type="number"
              min={800}
              max={3000}
              value={profileForm.preferredLength}
              onChange={(event) =>
                setProfileForm((prev) => ({
                  ...prev,
                  preferredLength: Number(event.target.value) || 1800,
                }))
              }
              placeholder="目标字数"
              className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
            />
          </div>

          {accounts.length === 0 && (
            <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
              尚未配置账号。请先前往“账号定位设置”页创建账号，保存后刷新本页。
            </p>
          )}

          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <input
              type="text"
              value={profileForm.audience}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, audience: event.target.value }))}
              placeholder="目标读者"
              className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
            />
            <input
              type="text"
              value={profileForm.tone}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, tone: event.target.value }))}
              placeholder="语气风格"
              className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
            />
          </div>

          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <input
              type="text"
              value={profileForm.contentPromise}
              onChange={(event) =>
                setProfileForm((prev) => ({
                  ...prev,
                  contentPromise: event.target.value,
                }))
              }
              placeholder="内容承诺"
              className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
            />
            <input
              type="text"
              value={profileForm.ctaStyle}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, ctaStyle: event.target.value }))}
              placeholder="CTA 风格"
              className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
            />
          </div>

          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <input
              type="text"
              value={profileForm.painPoints}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, painPoints: event.target.value }))}
              placeholder="读者痛点（分号分隔）"
              className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
            />
            <input
              type="text"
              value={profileForm.forbiddenTopics}
              onChange={(event) =>
                setProfileForm((prev) => ({
                  ...prev,
                  forbiddenTopics: event.target.value,
                }))
              }
              placeholder="禁区（分号分隔）"
              className="rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white dark:focus:border-white/30"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={savingProfile || loadingProfile || !selectedAccountId}
              className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {savingProfile ? '保存中...' : '保存定位'}
            </button>
            {profileVersions.slice(0, 3).map((version) => (
              <button
                key={version.id}
                type="button"
                onClick={() => void handleRollback(version.id)}
                disabled={rollingBackVersionId === version.id}
                className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
              >
                {rollingBackVersionId === version.id ? '回滚中...' : `回滚 ${formatTime(version.createdAt)}`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <OpportunityList
              opportunities={opportunities}
              loading={loadingOpportunities}
              selectedOpportunityId={selectedOpportunityId}
              generatingOpportunityId={generatingOpportunityId}
              onSelectOpportunity={handleSelectOpportunity}
              onGenerateDraft={(id) => {
                void handleGenerate(id);
              }}
            />

            {selectedOpportunity && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/80 px-4 py-3 text-xs text-gray-600 dark:border-white/[0.08] dark:bg-[#2a2a2d]/80 dark:text-gray-300">
                当前机会账号：{selectedOpportunity.account.name} ({selectedOpportunity.account.id})
              </div>
            )}

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
              regenerating={regenerating}
              planningAssets={planningAssets}
              copied={copied}
              onCopy={() => {
                void handleCopy();
              }}
              onRegenerate={() => {
                void handleRegenerate();
              }}
              onPlanAssets={() => {
                void handlePlanAssets();
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
