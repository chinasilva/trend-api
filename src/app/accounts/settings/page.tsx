'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchPipelineSession,
  loginPipeline,
  logoutPipeline,
  SESSION_AUTH_PLACEHOLDER,
} from '@/lib/client/pipeline-auth';
import {
  createAccount,
  getAccountProfile,
  listAccounts,
  rollbackAccountProfile,
  updateAccount,
  updateAccountProfile,
} from '@/lib/client/pipeline-api';
import type {
  AccountListItem,
  AccountMutationInput,
  AccountProfileInput,
  AccountProfileVersionItem,
} from '@/types/content-ui';

interface AccountFormState {
  name: string;
  platform: string;
  description: string;
  isActive: boolean;
  autoPublish: boolean;
  dailyLimit: number;
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

const EMPTY_ACCOUNT_FORM: AccountFormState = {
  name: '',
  platform: 'weixin',
  description: '',
  isActive: true,
  autoPublish: false,
  dailyLimit: 3,
};

const EMPTY_PROFILE_FORM: ProfileFormState = {
  audience: '',
  tone: '',
  growthGoal: 'read',
  painPoints: '',
  contentPromise: '',
  forbiddenTopics: '',
  ctaStyle: '',
  preferredLength: 1800,
};

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

function mapAccountForm(account: AccountListItem): AccountFormState {
  return {
    name: account.name,
    platform: account.platform,
    description: account.description || '',
    isActive: account.isActive,
    autoPublish: account.autoPublish,
    dailyLimit: account.dailyLimit,
  };
}

function toAccountPayload(form: AccountFormState): AccountMutationInput {
  return {
    name: form.name.trim(),
    platform: form.platform.trim().toLowerCase(),
    description: form.description,
    isActive: form.isActive,
    autoPublish: form.autoPublish,
    dailyLimit: Math.min(20, Math.max(1, Math.round(form.dailyLimit || 3))),
  };
}

function mapProfileForm(profile: AccountProfileInput): ProfileFormState {
  return {
    audience: profile.audience,
    tone: profile.tone,
    growthGoal: profile.growthGoal,
    painPoints: profile.painPoints.join('；'),
    contentPromise: profile.contentPromise || '',
    forbiddenTopics: profile.forbiddenTopics.join('；'),
    ctaStyle: profile.ctaStyle || '',
    preferredLength: profile.preferredLength,
  };
}

function toProfilePayload(form: ProfileFormState): AccountProfileInput {
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

export default function AccountSettingsPage() {
  const [apiSecret, setApiSecret] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authChecking, setAuthChecking] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState('');

  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [manualCreateMode, setManualCreateMode] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountFormState>(EMPTY_ACCOUNT_FORM);

  const [profileForm, setProfileForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [versions, setVersions] = useState<AccountProfileVersionItem[]>([]);

  const [message, setMessage] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [rollingVersionId, setRollingVersionId] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    setAuthChecking(true);
    try {
      const session = await fetchPipelineSession();
      if (session.authenticated) {
        setAuthUser(session.username || 'admin');
        setApiSecret(SESSION_AUTH_PLACEHOLDER);
      } else {
        setAuthUser(null);
        setApiSecret('');
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : '登录状态校验失败');
      setAuthUser(null);
      setApiSecret('');
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  async function handleLogin() {
    const username = loginUsername.trim();
    if (!username || !loginPassword) {
      setAuthMessage('请输入账号和密码');
      return;
    }

    setAuthSubmitting(true);
    setAuthMessage('');
    try {
      const session = await loginPipeline(username, loginPassword);
      setAuthUser(session.username || username);
      setApiSecret(SESSION_AUTH_PLACEHOLDER);
      setLoginPassword('');
      setMessage('');
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : '登录失败');
      setAuthUser(null);
      setApiSecret('');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    setAuthSubmitting(true);
    setAuthMessage('');
    try {
      await logoutPipeline();
      setAuthUser(null);
      setApiSecret('');
      setAccounts([]);
      setSelectedAccountId('');
      setVersions([]);
      setMessage('');
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : '退出登录失败');
    } finally {
      setAuthSubmitting(false);
    }
  }

  const reloadAccounts = useCallback(
    async (preferredAccountId?: string) => {
      if (!apiSecret.trim()) {
        return;
      }

      const items = await listAccounts(apiSecret.trim(), { includeInactive: true });
      setAccounts(items);

      if (items.length === 0) {
        setSelectedAccountId('');
        setCreatingAccount(true);
        setManualCreateMode(true);
        setAccountForm(EMPTY_ACCOUNT_FORM);
        setProfileForm(EMPTY_PROFILE_FORM);
        setVersions([]);
        return;
      }

      if (manualCreateMode && !preferredAccountId) {
        setSelectedAccountId('');
        setCreatingAccount(true);
        return;
      }

      const preferId = preferredAccountId || '';
      const picked = items.find((item) => item.id === preferId) || items[0];
      setSelectedAccountId(picked.id);
      setCreatingAccount(false);
      setManualCreateMode(false);
      setAccountForm(mapAccountForm(picked));
    },
    [apiSecret, manualCreateMode]
  );

  useEffect(() => {
    async function load() {
      if (!apiSecret.trim()) {
        return;
      }

      setLoadingAccounts(true);
      setMessage('');
      try {
        await reloadAccounts();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '加载账号失败');
      } finally {
        setLoadingAccounts(false);
      }
    }

    void load();
  }, [apiSecret, reloadAccounts]);

  useEffect(() => {
    const picked = accounts.find((item) => item.id === selectedAccountId);
    if (picked) {
      setCreatingAccount(false);
      setManualCreateMode(false);
      setAccountForm(mapAccountForm(picked));
    }
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    async function loadProfile() {
      if (!apiSecret.trim() || !selectedAccountId) {
        return;
      }

      setLoadingProfile(true);
      try {
        const result = await getAccountProfile(apiSecret.trim(), selectedAccountId);
        setProfileForm(mapProfileForm(result.profile));
        setVersions(result.versions);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '加载账号定位失败');
      } finally {
        setLoadingProfile(false);
      }
    }

    void loadProfile();
  }, [apiSecret, selectedAccountId]);

  async function handleSaveAccount() {
    if (!apiSecret.trim()) {
      setMessage('请先登录');
      return;
    }

    const payload = toAccountPayload(accountForm);
    if (!payload.name) {
      setMessage('请输入账号名称');
      return;
    }

    setSavingAccount(true);
    setMessage('');
    try {
      if (creatingAccount) {
        const created = await createAccount(apiSecret.trim(), payload);
        await reloadAccounts(created.id);
        setMessage('账号创建成功。');
      } else {
        if (!selectedAccountId) {
          setMessage('请选择账号或切换到新建模式');
          return;
        }

        const updated = await updateAccount(apiSecret.trim(), selectedAccountId, payload);
        await reloadAccounts(updated.id);
        setMessage('账号更新成功。');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : creatingAccount ? '创建账号失败' : '更新账号失败');
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleSaveProfile() {
    if (!apiSecret.trim() || !selectedAccountId) {
      setMessage('请先登录并选择账号');
      return;
    }

    setSavingProfile(true);
    setMessage('');
    try {
      const result = await updateAccountProfile(apiSecret.trim(), selectedAccountId, toProfilePayload(profileForm));
      setProfileForm(mapProfileForm(result.profile));
      setVersions(result.versions);
      setMessage('账号定位保存成功，已全局生效。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存账号定位失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleRollback(versionId: string) {
    if (!apiSecret.trim() || !selectedAccountId) {
      setMessage('请先登录并选择账号');
      return;
    }

    setRollingVersionId(versionId);
    setMessage('');
    try {
      const result = await rollbackAccountProfile(apiSecret.trim(), selectedAccountId, versionId);
      setProfileForm(mapProfileForm(result.profile));
      setVersions(result.versions);
      setMessage('回滚成功，已生成新当前版本。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '回滚失败');
    } finally {
      setRollingVersionId(null);
    }
  }

  if (authChecking) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-gray-600 dark:text-gray-300">正在校验登录状态...</p>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">账号与定位设置</h1>
          <Link href="/" className="text-sm text-blue-600 underline">
            返回首页
          </Link>
        </div>

        <div className="space-y-4 rounded-3xl border border-black/[0.08] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1c1c1e]">
          <p className="text-sm text-gray-600 dark:text-gray-300">请先登录后再进行账号与定位管理。</p>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={loginUsername}
              onChange={(event) => setLoginUsername(event.target.value)}
              placeholder="登录账号"
              className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
            />
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="登录密码"
              className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
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
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {authSubmitting ? '登录中...' : '登录'}
          </button>
          {authMessage && <p className="text-sm text-red-600 dark:text-red-300">{authMessage}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">账号与定位设置</h1>
        <Link href="/" className="text-sm text-blue-600 underline">
          返回首页
        </Link>
      </div>

      <div className="space-y-4 rounded-3xl border border-black/[0.08] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1c1c1e]">
        <div className="flex items-center justify-between rounded-2xl border border-black/[0.08] px-4 py-2.5 text-xs dark:border-white/[0.08]">
          <span>已登录账号：{authUser}</span>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={authSubmitting}
            className="rounded-full border border-black/10 px-3 py-1 dark:border-white/10"
          >
            {authSubmitting ? '退出中...' : '退出登录'}
          </button>
        </div>

        <section className="space-y-3 rounded-2xl border border-black/[0.08] p-4 dark:border-white/[0.08]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">账号管理</h2>
            <button
              type="button"
              onClick={() => {
                setCreatingAccount(true);
                setManualCreateMode(true);
                setSelectedAccountId('');
                setAccountForm(EMPTY_ACCOUNT_FORM);
                setProfileForm(EMPTY_PROFILE_FORM);
                setVersions([]);
                setMessage('');
              }}
              className="rounded-full border border-black/10 px-3 py-1 text-xs dark:border-white/10"
            >
              新建账号
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={selectedAccountId}
              onChange={(event) => {
                setSelectedAccountId(event.target.value);
                setCreatingAccount(false);
                setManualCreateMode(false);
              }}
              className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
            >
              <option value="">选择账号</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.platform}) {account.isActive ? '' : '[停用]'}
                </option>
              ))}
            </select>
            <select
              value={accountForm.platform}
              onChange={(event) => setAccountForm((prev) => ({ ...prev, platform: event.target.value }))}
              className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
            >
              <option value="weixin">weixin</option>
            </select>
            <input
              value={accountForm.name}
              onChange={(event) => setAccountForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="账号名称"
              className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
            />
            <input
              type="number"
              min={1}
              max={20}
              value={accountForm.dailyLimit}
              onChange={(event) =>
                setAccountForm((prev) => ({
                  ...prev,
                  dailyLimit: Number(event.target.value) || 3,
                }))
              }
              placeholder="每日上限"
              className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
            />
          </div>

          <textarea
            value={accountForm.description}
            onChange={(event) => setAccountForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="账号描述（可选）"
            rows={2}
            className="w-full rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
          />

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={accountForm.isActive}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              账号激活
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={accountForm.autoPublish}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    autoPublish: event.target.checked,
                  }))
                }
              />
              自动发布
            </label>
          </div>

          <button
            type="button"
            onClick={() => void handleSaveAccount()}
            disabled={savingAccount || loadingAccounts || !apiSecret.trim()}
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {savingAccount ? '保存中...' : creatingAccount ? '创建账号' : '保存账号信息'}
          </button>

          {accounts.length === 0 && !creatingAccount && (
            <p className="text-xs text-amber-700 dark:text-amber-300">当前暂无账号，请先创建账号。</p>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-black/[0.08] p-4 dark:border-white/[0.08]">
          <h2 className="text-sm font-semibold">账号定位</h2>

          {!selectedAccountId ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">请先创建或选择账号，再配置账号定位。</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={profileForm.audience}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, audience: event.target.value }))}
                  placeholder="目标读者"
                  className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
                />
                <input
                  value={profileForm.tone}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, tone: event.target.value }))}
                  placeholder="语气风格"
                  className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
                />
                <input
                  value={profileForm.growthGoal}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, growthGoal: event.target.value }))}
                  placeholder="增长目标"
                  className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
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
                  className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
                />
                <input
                  value={profileForm.contentPromise}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, contentPromise: event.target.value }))}
                  placeholder="内容承诺"
                  className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
                />
                <input
                  value={profileForm.ctaStyle}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, ctaStyle: event.target.value }))}
                  placeholder="CTA 风格"
                  className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
                />
                <input
                  value={profileForm.painPoints}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, painPoints: event.target.value }))}
                  placeholder="读者痛点（分号分隔）"
                  className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
                />
                <input
                  value={profileForm.forbiddenTopics}
                  onChange={(event) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      forbiddenTopics: event.target.value,
                    }))
                  }
                  placeholder="禁区（分号分隔）"
                  className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
                />
              </div>

              <button
                type="button"
                onClick={() => void handleSaveProfile()}
                disabled={savingProfile || loadingProfile}
                className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {savingProfile ? '保存中...' : '保存并全局生效'}
              </button>

              <div className="rounded-2xl border border-black/[0.08] p-3 dark:border-white/[0.08]">
                <p className="mb-2 text-sm font-semibold">最近版本（最多10条）</p>
                <div className="space-y-2">
                  {versions.map((version) => (
                    <div key={version.id} className="flex items-center justify-between text-xs">
                      <span>{formatTime(version.createdAt)}</span>
                      <button
                        type="button"
                        onClick={() => void handleRollback(version.id)}
                        disabled={rollingVersionId === version.id}
                        className="rounded-full border border-black/10 px-3 py-1 disabled:opacity-50 dark:border-white/10"
                      >
                        {rollingVersionId === version.id ? '回滚中' : '回滚'}
                      </button>
                    </div>
                  ))}
                  {versions.length === 0 && <p className="text-xs text-gray-500">暂无历史版本</p>}
                </div>
              </div>
            </>
          )}
        </section>

        {message && <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
      </div>
    </main>
  );
}
