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
  { label: 'Active Status', field: 'isActive' },
  { label: 'Auto Publish', field: 'autoPublish' },
  { label: 'AI Generation', field: 'autoGenerateEnabled' },
];

const PROFILE_FIELDS: Array<{ label: string; field: ProfileField; placeholder?: string; type?: 'text' | 'number' }> = [
  { label: 'Target Persona', field: 'audience', placeholder: 'e.g. Corporate Executives' },
  { label: 'Editorial Tone', field: 'tone', placeholder: 'e.g. Authoritative, Sharp' },
  { label: 'Growth Objective', field: 'growthGoal', placeholder: 'e.g. Brand Influence' },
  { label: 'Preferred Length', field: 'preferredLength', type: 'number' },
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
  growthGoal: 'read',
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
      setAuthMessage('Login failed');
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
      setAuthMessage('Logout failed');
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
      setMessage('Please select an account first');
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
      setMessage('Account saved successfully');
    } catch (error) {
      setMessage('Save failed');
    } finally {
      setSavingAccount(false);
    }
  }

  function handleAccountToggleChange(field: AccountToggleField, checked: boolean) {
    setAccountForm((prev) => ({ ...prev, [field]: checked }));
  }

  function handleProfileFieldChange(field: ProfileField, value: string) {
    setProfileForm((prev) => ({
      ...prev,
      [field]: field === 'preferredLength' ? Number(value) || 1800 : value,
    }));
  }

  async function handleSaveProfile() {
    if (!apiSecret.trim() || !selectedAccountId) return;
    setSavingProfile(true);
    try {
      const res = await updateAccountProfile(apiSecret.trim(), selectedAccountId, toProfilePayload(profileForm));
      setProfileForm(mapProfileForm(res.profile));
      setVersions(res.versions);
      setMessage('Profile updated');
    } catch (error) {
      setMessage('Update failed');
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
      setMessage('Rolled back');
    } catch (error) {
      setMessage('Rollback failed');
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
          <h1 className="text-xl font-black mb-2">TrendPulse Control</h1>
          <p className="text-sm text-slate-500 mb-8">Sign in to manage accounts</p>
          <div className="space-y-4">
            <input
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="Username"
              className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none text-sm font-medium"
            />
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 outline-none text-sm font-medium"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button
              onClick={handleLogin}
              disabled={authSubmitting}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700 disabled:opacity-50 transition-all"
            >
              {authSubmitting ? 'SIGNING IN...' : 'CONTINUE'}
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
            <h1 className="text-sm font-black uppercase tracking-widest">Account Hub</h1>
          </div>
          <button onClick={handleLogout} className="text-[10px] font-black text-red-500 uppercase hover:underline">Log out</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Registry Management</h2>
            <button
              onClick={() => {
                setCreatingAccount(true);
                setSelectedAccountId('');
                setAccountForm(EMPTY_ACCOUNT_FORM);
              }}
              className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black rounded-lg uppercase"
            >
              New Account
            </button>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Select Target</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium appearance-none"
                >
                  <option value="">Choose Active Account</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.platform})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Display Name</label>
                <input
                  value={accountForm.name}
                  onChange={(e) => setAccountForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
               <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Daily Limit</label>
                <input
                  type="number"
                  value={accountForm.dailyLimit}
                  onChange={(e) => setAccountForm(p => ({ ...p, dailyLimit: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Trigger Time</label>
                <input
                  type="time"
                  value={accountForm.autoGenerateTime}
                  onChange={(e) => setAccountForm(p => ({ ...p, autoGenerateTime: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Lead Minutes</label>
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
                    onChange={(e) => handleAccountToggleChange(opt.field, e.target.checked)}
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
              {savingAccount ? 'Syncing...' : (creatingAccount ? 'Create Account' : 'Update Registry')}
            </button>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center">
             <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Content Positioning</h2>
          </div>
          <div className="p-6 space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              {PROFILE_FIELDS.map((field) => (
                <div key={field.field} className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase">{field.label}</label>
                  <input
                    type={field.type || 'text'}
                    value={String(profileForm[field.field])}
                    onChange={(e) => handleProfileFieldChange(field.field, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none font-medium"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase">Reader Pain Points (Separator: ;)</label>
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
              {savingProfile ? 'Updating...' : 'Save Positioning'}
            </button>

            <div className="pt-10">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Version History</h4>
              <div className="space-y-2">
                {versions.map(v => (
                  <div key={v.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="text-[10px] font-black text-slate-900 dark:text-white uppercase">{formatTime(v.createdAt)}</div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase truncate max-w-[400px]">
                          Target: {displayText(v.profileSnapshot?.audience)} · Tone: {displayText(v.profileSnapshot?.tone)}
                        </p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setExpandedVersionId(expandedVersionId === v.id ? null : v.id)}
                          className="px-2 py-1 text-[9px] font-black text-slate-500 hover:text-slate-900 dark:hover:text-white uppercase"
                        >
                          {expandedVersionId === v.id ? 'Hide' : 'Inspect'}
                        </button>
                        <button
                          onClick={() => handleRollback(v.id)}
                          disabled={rollingVersionId === v.id}
                          className="px-2 py-1 text-[9px] font-black text-indigo-600 hover:underline uppercase"
                        >
                          {rollingVersionId === v.id ? '...' : 'Restore'}
                        </button>
                      </div>
                    </div>
                    {expandedVersionId === v.id && (
                      <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 grid gap-4 md:grid-cols-2">
                        {[
                          { l: 'Audience', v: v.profileSnapshot?.audience },
                          { l: 'Tone', v: v.profileSnapshot?.tone },
                          { l: 'Goal', v: v.profileSnapshot?.growthGoal },
                          { l: 'Points', v: v.profileSnapshot?.painPoints, list: true },
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
             Status: {message}
          </div>
        )}
      </main>
    </div>
  );
}
