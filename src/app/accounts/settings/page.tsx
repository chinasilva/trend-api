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
  autoGenerateEnabled: boolean;
  autoGenerateTime: string;
  autoGenerateLeadMinutes: number;
  autoGenerateTimezone: string;
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

type AccountToggleField = 'isActive' | 'autoPublish' | 'autoGenerateEnabled';
type ProfileField = 'audience' | 'tone' | 'growthGoal' | 'preferredLength';

const ACCOUNT_TOGGLE_OPTIONS: Array<{ label: string; field: AccountToggleField }> = [
  { label: '账号激活状态', field: 'isActive' },
  { label: '全自动发布', field: 'autoPublish' },
  { label: '启用 AI 自动生产', field: 'autoGenerateEnabled' },
];

const PROFILE_FIELDS: Array<{
  label: string;
  field: ProfileField;
  placeholder?: string;
  type?: 'text' | 'number';
}> = [
  { label: '目标读者画像', field: 'audience', placeholder: '如：高净值商务人士' },
  { label: '编辑部语气', field: 'tone', placeholder: '如：权威、冷静、客观' },
  { label: '账号核心增长目标', field: 'growthGoal', placeholder: '如：提升业界影响力' },
  { label: '期望输出字数', field: 'preferredLength', type: 'number' },
];

const EMPTY_ACCOUNT_FORM: AccountFormState = {
  name: '',
  platform: 'weixin',
  description: '',
  isActive: true,
  autoPublish: false,
  dailyLimit: 3,
  autoGenerateEnabled: false,
  autoGenerateTime: '09:00',
  autoGenerateLeadMinutes: 60,
  autoGenerateTimezone: 'Asia/Shanghai',
};

const EMPTY_PROFILE_FORM: ProfileFormState = {
  audience: '',
  tone: '',
  growthGoal: '阅读量',
  painPoints: '',
  contentPromise: '',
  forbiddenTopics: '',
  ctaStyle: '',
  preferredLength: 1800,
};

function splitList(input: string) {
  return Array.from(new Set(input.split(/[；;，,\n]/).map((item) => item.trim()).filter(Boolean)));
}

function mapAccountForm(account: AccountListItem): AccountFormState {
  return {
    name: account.name,
    platform: account.platform,
    description: account.description || '',
    isActive: account.isActive,
    autoPublish: account.autoPublish,
    dailyLimit: account.dailyLimit,
    autoGenerateEnabled: account.autoGenerateEnabled ?? false,
    autoGenerateTime: account.autoGenerateTime || '09:00',
    autoGenerateLeadMinutes: account.autoGenerateLeadMinutes ?? 60,
    autoGenerateTimezone: account.autoGenerateTimezone || 'Asia/Shanghai',
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
    autoGenerateEnabled: form.autoGenerateEnabled,
    autoGenerateTime: form.autoGenerateTime.trim() || null,
    autoGenerateLeadMinutes: Math.min(360, Math.max(5, Math.round(form.autoGenerateLeadMinutes || 60))),
    autoGenerateTimezone: form.autoGenerateTimezone.trim() || 'Asia/Shanghai',
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
    growthGoal: form.growthGoal.trim() || '阅读量',
    painPoints: splitList(form.painPoints),
    contentPromise: form.contentPromise.trim() || undefined,
    forbiddenTopics: splitList(form.forbiddenTopics),
    ctaStyle: form.ctaStyle.trim() || undefined,
    preferredLength: Math.min(3000, Math.max(800, Math.round(form.preferredLength || 1800))),
  };
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function displayText(value: string | undefined) {
  return (value || '').trim() || '-';
}

function displayList(value: string[] | undefined) {
  if (!Array.isArray(value) || value.length === 0) return '-';
  return value.join('；') || '-';
}

function updateAccountToggle(
  form: AccountFormState,
  field: AccountToggleField,
  checked: boolean
) {
  return { ...form, [field]: checked };
}

function updateProfileField(
  form: ProfileFormState,
  field: ProfileField,
  value: string
) {
  return {
    ...form,
    [field]: field === 'preferredLength' ? Number(value) || 1800 : value,
  };
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
  const [accountForm, setAccountForm] = useState<AccountFormState>(EMPTY_ACCOUNT_FORM);

  const [profileForm, setProfileForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [versions, setVersions] = useState<AccountProfileVersionItem[]>([]);

  const [message, setMessage] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [rollingVersionId, setRollingVersionId] = useState<string | null>(null);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);

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
      setAuthUser(null);
      setApiSecret('');
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);

  async function handleLogin() {
    const username = loginUsername.trim();
    if (!username || !loginPassword) return;
    setAuthSubmitting(true);
    setAuthMessage('');
    try {
      const session = await loginPipeline(username, loginPassword);
      setAuthUser(session.username || username);
      setApiSecret(SESSION_AUTH_PLACEHOLDER);
    } catch (error) {
      setAuthMessage('登录失败');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    setAuthSubmitting(true);
    try {
      await logoutPipeline();
      setAuthUser(null);
      setApiSecret('');
      setAccounts([]);
    } catch (error) {
      setAuthMessage('退出登录失败');
    } finally {
      setAuthSubmitting(false);
    }
  }

  const reloadAccounts = useCallback(async (preferredAccountId?: string) => {
    if (!apiSecret.trim()) return;
    const items = await listAccounts(apiSecret.trim(), { includeInactive: true });
    setAccounts(items);
    if (items.length === 0) {
      setSelectedAccountId('');
      setCreatingAccount(true);
      setAccountForm(EMPTY_ACCOUNT_FORM);
      return;
    }
    const preferId = preferredAccountId || (items.length > 0 ? items[0].id : '');
    setSelectedAccountId(preferId);
    setCreatingAccount(false);
  }, [apiSecret]);

  useEffect(() => {
    if (apiSecret.trim()) {
      setLoadingAccounts(true);
      reloadAccounts().finally(() => setLoadingAccounts(false));
    }
  }, [apiSecret, reloadAccounts]);

  useEffect(() => {
    const picked = accounts.find(a => a.id === selectedAccountId);
    if (picked) {
      setCreatingAccount(false);
      setAccountForm(mapAccountForm(picked));
    }
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    if (apiSecret.trim() && selectedAccountId) {
      setLoadingProfile(true);
      getAccountProfile(apiSecret.trim(), selectedAccountId)
        .then(res => {
          setProfileForm(mapProfileForm(res.profile));
          setVersions(res.versions);
        })
        .finally(() => setLoadingProfile(false));
    }
  }, [apiSecret, selectedAccountId]);

  async function handleSaveAccount() {
    if (!apiSecret.trim()) return;
    const payload = toAccountPayload(accountForm);
    if (!payload.name) return;
    if (!creatingAccount && !selectedAccountId) {
      setMessage('请先选择一个账号。');
      return;
    }
    setSavingAccount(true);
    try {
      if (creatingAccount) {
        const created = await createAccount(apiSecret.trim(), payload);
        await reloadAccounts(created.id);
      } else {
        await updateAccount(apiSecret.trim(), selectedAccountId, payload);
        await reloadAccounts(selectedAccountId);
      }
      setMessage('账号信息已同步。');
    } catch (error) {
      setMessage('保存失败');
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleSaveProfile() {
    if (!apiSecret.trim() || !selectedAccountId) return;
    setSavingProfile(true);
    try {
      const res = await updateAccountProfile(apiSecret.trim(), selectedAccountId, toProfilePayload(profileForm));
      setProfileForm(mapProfileForm(res.profile));
      setVersions(res.versions);
      setMessage('定位配置已全局生效。');
    } catch (error) {
      setMessage('更新失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleRollback(versionId: string) {
    if (!apiSecret.trim() || !selectedAccountId) return;
    setRollingVersionId(versionId);
    try {
      const res = await rollbackAccountProfile(apiSecret.trim(), selectedAccountId, versionId);
      setProfileForm(mapProfileForm(res.profile));
      setVersions(res.versions);
      setMessage('已成功回滚版本。');
    } catch (error) {
      setMessage('回滚失败');
    } finally {
      setRollingVersionId(null);
    }
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
          <h1 className="text-xl font-black mb-2">TrendPulse 控制中心</h1>
          <p className="text-sm text-slate-500 mb-8">请登录以管理账号定位</p>
          <div className="space-y-4">
            <input
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="账号"
              className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none text-sm font-medium"
            />
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="密码"
              className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none text-sm font-medium"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button
              onClick={handleLogin}
              disabled={authSubmitting}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700 disabled:opacity-50 transition-all"
            >
              {authSubmitting ? '登录中...' : '继续访问'}
            </button>
            {authMessage && <p className="text-xs text-red-500 font-bold">{authMessage}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 pb-20">
      <header className="sticky top-0 z-50 glass-effect border-b border-slate-200 dark:border-slate-800 h-16">
        <div className="max-w-5xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </Link>
            <h1 className="text-sm font-black uppercase tracking-widest text-indigo-600">账号管理中心</h1>
          </div>
          <button onClick={handleLogout} className="text-[10px] font-black text-red-500 uppercase hover:underline">退出登录</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">账号注册与基础配置</h2>
            <button
              onClick={() => {
                setCreatingAccount(true);
                setSelectedAccountId('');
                setAccountForm(EMPTY_ACCOUNT_FORM);
              }}
              className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black rounded-lg uppercase"
            >
              新建账号
            </button>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">选择目标账号</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium appearance-none"
                >
                  <option value="">选择已有账号</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.platform})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">显示名称</label>
                <input
                  value={accountForm.name}
                  onChange={(e) => setAccountForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
               <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">每日发稿上限</label>
                <input
                  type="number"
                  value={accountForm.dailyLimit}
                  onChange={(e) => setAccountForm(p => ({ ...p, dailyLimit: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">定时触发时间</label>
                <input
                  type="time"
                  value={accountForm.autoGenerateTime}
                  onChange={(e) => setAccountForm(p => ({ ...p, autoGenerateTime: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">提前采集分钟</label>
                <input
                  type="number"
                  value={accountForm.autoGenerateLeadMinutes}
                  onChange={(e) => setAccountForm(p => ({ ...p, autoGenerateLeadMinutes: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
              {ACCOUNT_TOGGLE_OPTIONS.map((opt) => (
                <label key={opt.field} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={accountForm[opt.field]}
                    onChange={(e) =>
                      setAccountForm((prev) => updateAccountToggle(prev, opt.field, e.target.checked))
                    }
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
                  />
                  <span className="text-[10px] font-black text-slate-500 uppercase group-hover:text-slate-900 transition-colors">{opt.label}</span>
                </label>
              ))}
            </div>

            <button
              onClick={handleSaveAccount}
              disabled={savingAccount || (!creatingAccount && !selectedAccountId)}
              className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-black rounded-xl uppercase shadow-lg shadow-slate-900/10 dark:shadow-none"
            >
              {savingAccount ? '同步中...' : (creatingAccount ? '创建新账号' : '更新基础配置')}
            </button>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center">
             <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">内容创作定位配置 (Positioning)</h2>
          </div>
          <div className="p-6 space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              {PROFILE_FIELDS.map((field) => (
                <div key={field.field} className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase">{field.label}</label>
                  <input
                    type={field.type || 'text'}
                    value={String(profileForm[field.field])}
                    onChange={(e) =>
                      setProfileForm((prev) => updateProfileField(prev, field.field, e.target.value))
                    }
                    placeholder={field.placeholder}
                    className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase">读者痛点标注 (使用分号分隔)</label>
              <textarea
                value={profileForm.painPoints}
                onChange={(e) => setProfileForm(p => ({ ...p, painPoints: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium"
                rows={2}
              />
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={savingProfile || !selectedAccountId}
              className="px-6 py-2.5 bg-indigo-600 text-white text-[11px] font-black rounded-xl uppercase shadow-lg shadow-indigo-500/20"
            >
              {savingProfile ? '正在更新策略...' : '保存并应用定位策略'}
            </button>

            <div className="pt-10">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">策略版本历史</h4>
              <div className="space-y-2">
                {versions.map(v => (
                  <div key={v.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="text-[10px] font-black text-slate-900 dark:text-white uppercase">{formatTime(v.createdAt)}</div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase truncate max-w-[400px]">
                          受众: {displayText(v.profileSnapshot?.audience)} · 语气: {displayText(v.profileSnapshot?.tone)}
                        </p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setExpandedVersionId(expandedVersionId === v.id ? null : v.id)}
                          className="px-2 py-1 text-[9px] font-black text-slate-500 hover:text-slate-900 dark:hover:text-white uppercase"
                        >
                          {expandedVersionId === v.id ? '收起' : '查看详情'}
                        </button>
                        <button
                          onClick={() => handleRollback(v.id)}
                          disabled={rollingVersionId === v.id}
                          className="px-2 py-1 text-[9px] font-black text-indigo-600 hover:underline uppercase"
                        >
                          {rollingVersionId === v.id ? '...' : '还原此版本'}
                        </button>
                      </div>
                    </div>
                    {expandedVersionId === v.id && (
                      <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 grid gap-4 md:grid-cols-2">
                        {[
                          { l: '读者画像', v: v.profileSnapshot?.audience },
                          { l: '语气定位', v: v.profileSnapshot?.tone },
                          { l: '增长目标', v: v.profileSnapshot?.growthGoal },
                          { l: '标注痛点', v: v.profileSnapshot?.painPoints, list: true },
                        ].map(it => (
                          <div key={it.l} className="space-y-0.5">
                            <span className="text-[8px] font-black text-slate-400 uppercase">{it.l}</span>
                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                              {it.list ? displayList(it.v as string[]) : displayText(it.v as string)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {message && (
          <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">
             系统状态: {message}
          </div>
        )}
      </main>
    </div>
  );
}
