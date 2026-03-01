'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  getAccountProfile,
  listAccounts,
  rollbackAccountProfile,
  updateAccountProfile,
} from '@/lib/client/pipeline-api';
import type { AccountProfileInput, AccountProfileVersionItem } from '@/types/content-ui';

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

const EMPTY_FORM: ProfileFormState = {
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

function mapForm(profile: AccountProfileInput): ProfileFormState {
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

function toPayload(form: ProfileFormState): AccountProfileInput {
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
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; platform: string }>>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [versions, setVersions] = useState<AccountProfileVersionItem[]>([]);
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rollingVersionId, setRollingVersionId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!apiSecret.trim()) {
        return;
      }

      setLoading(true);
      setMessage('');
      try {
        const items = await listAccounts(apiSecret.trim());
        setAccounts(items);
        if (!selectedAccountId && items.length > 0) {
          setSelectedAccountId(items[0].id);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '加载账号失败');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [apiSecret, selectedAccountId]);

  useEffect(() => {
    async function loadProfile() {
      if (!apiSecret.trim() || !selectedAccountId) {
        return;
      }

      setLoading(true);
      setMessage('');
      try {
        const result = await getAccountProfile(apiSecret.trim(), selectedAccountId);
        setForm(mapForm(result.profile));
        setVersions(result.versions);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '加载账号定位失败');
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, [apiSecret, selectedAccountId]);

  async function handleSave() {
    if (!apiSecret.trim() || !selectedAccountId) {
      setMessage('请输入 API 密钥并选择账号');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const result = await updateAccountProfile(apiSecret.trim(), selectedAccountId, toPayload(form));
      setForm(mapForm(result.profile));
      setVersions(result.versions);
      setMessage('保存成功，已全局生效。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleRollback(versionId: string) {
    if (!apiSecret.trim() || !selectedAccountId) {
      setMessage('请输入 API 密钥并选择账号');
      return;
    }

    setRollingVersionId(versionId);
    setMessage('');
    try {
      const result = await rollbackAccountProfile(apiSecret.trim(), selectedAccountId, versionId);
      setForm(mapForm(result.profile));
      setVersions(result.versions);
      setMessage('回滚成功，已生成新当前版本。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '回滚失败');
    } finally {
      setRollingVersionId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">账号定位设置</h1>
        <Link href="/" className="text-sm text-blue-600 underline">
          返回首页
        </Link>
      </div>

      <div className="space-y-4 rounded-3xl border border-black/[0.08] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1c1c1e]">
        <div className="grid gap-3 md:grid-cols-2">
          <input
            type="password"
            value={apiSecret}
            onChange={(event) => setApiSecret(event.target.value)}
            placeholder="PIPELINE_API_SECRET"
            className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
          />
          <select
            value={selectedAccountId}
            onChange={(event) => setSelectedAccountId(event.target.value)}
            className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
          >
            <option value="">选择账号</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.platform})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.audience}
            onChange={(event) => setForm((prev) => ({ ...prev, audience: event.target.value }))}
            placeholder="目标读者"
            className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
          />
          <input
            value={form.tone}
            onChange={(event) => setForm((prev) => ({ ...prev, tone: event.target.value }))}
            placeholder="语气风格"
            className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
          />
          <input
            value={form.growthGoal}
            onChange={(event) => setForm((prev) => ({ ...prev, growthGoal: event.target.value }))}
            placeholder="增长目标"
            className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
          />
          <input
            type="number"
            min={800}
            max={3000}
            value={form.preferredLength}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, preferredLength: Number(event.target.value) || 1800 }))
            }
            placeholder="目标字数"
            className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
          />
          <input
            value={form.contentPromise}
            onChange={(event) => setForm((prev) => ({ ...prev, contentPromise: event.target.value }))}
            placeholder="内容承诺"
            className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
          />
          <input
            value={form.ctaStyle}
            onChange={(event) => setForm((prev) => ({ ...prev, ctaStyle: event.target.value }))}
            placeholder="CTA 风格"
            className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
          />
          <input
            value={form.painPoints}
            onChange={(event) => setForm((prev) => ({ ...prev, painPoints: event.target.value }))}
            placeholder="读者痛点（分号分隔）"
            className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
          />
          <input
            value={form.forbiddenTopics}
            onChange={(event) => setForm((prev) => ({ ...prev, forbiddenTopics: event.target.value }))}
            placeholder="禁区（分号分隔）"
            className="rounded-2xl border border-black/[0.08] px-4 py-2.5 text-sm outline-none focus:border-black/25 dark:border-white/[0.1] dark:bg-[#2a2a2d] dark:text-white"
          />
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loading}
          className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {saving ? '保存中...' : '保存并全局生效'}
        </button>

        {message && <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}

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
      </div>
    </main>
  );
}
