import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  AccountProfileData,
  AccountProfileInput,
  AccountProfileVersionItem,
} from '@/types/pipeline';

const MAX_PROFILE_HISTORY = 10;
const ACCOUNT_PLATFORM_WHITELIST = new Set(['weixin']);

const DEFAULT_PROFILE: AccountProfileInput = {
  audience: '关注实时热点、希望快速理解事件影响的中文读者',
  tone: '专业但通俗',
  growthGoal: 'read',
  painPoints: ['信息太碎片化', '不知道如何判断热点真伪', '缺少可执行建议'],
  contentPromise: '3分钟看懂热点的来龙去脉，并获得可执行建议',
  forbiddenTopics: ['违法违规', '仇恨言论', '明显未经证实的谣言'],
  ctaStyle: '评论区提问+下篇预告',
  preferredLength: 1800,
};

export interface AccountListItem {
  id: string;
  name: string;
  platform: string;
  description: string | null;
  isActive: boolean;
  autoPublish: boolean;
  dailyLimit: number;
}

export interface AccountMutationInput {
  name?: string;
  platform?: string;
  description?: string;
  isActive?: boolean;
  autoPublish?: boolean;
  dailyLimit?: number;
}

function normalizeStringArray(value: unknown, max = 10) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, max);
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, maxLength);
}

function normalizeLength(value: unknown, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(3000, Math.max(800, Math.round(value)));
}

function normalizeAccountName(value: unknown, fallback?: string) {
  if (typeof value !== 'string') {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error('Validation failed: account name is required.');
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error('Validation failed: account name is required.');
  }

  return normalized.slice(0, 80);
}

function normalizeAccountPlatform(value: unknown, fallback?: string) {
  if (typeof value !== 'string') {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error('Validation failed: account platform is required.');
  }

  const normalized = value.trim().toLowerCase();
  if (!ACCOUNT_PLATFORM_WHITELIST.has(normalized)) {
    throw new Error(`Validation failed: unsupported account platform "${normalized}".`);
  }

  return normalized;
}

function normalizeAccountDescription(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 300);
}

function normalizeAccountDailyLimit(value: unknown, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(20, Math.max(1, Math.round(value)));
}

function normalizeAccountFlag(value: unknown, fallback: boolean) {
  if (typeof value !== 'boolean') {
    return fallback;
  }

  return value;
}

function toInput(profile: {
  audience: string;
  tone: string;
  growthGoal: string;
  painPoints: Prisma.JsonValue | null;
  contentPromise: string | null;
  forbiddenTopics: Prisma.JsonValue | null;
  ctaStyle: string | null;
  preferredLength: number;
}): AccountProfileInput {
  return {
    audience: profile.audience,
    tone: profile.tone,
    growthGoal: profile.growthGoal,
    painPoints: normalizeStringArray(profile.painPoints),
    contentPromise: profile.contentPromise ?? undefined,
    forbiddenTopics: normalizeStringArray(profile.forbiddenTopics),
    ctaStyle: profile.ctaStyle ?? undefined,
    preferredLength: profile.preferredLength,
  };
}

function toProfileData(profile: {
  id: string;
  accountId: string;
  audience: string;
  tone: string;
  growthGoal: string;
  painPoints: Prisma.JsonValue | null;
  contentPromise: string | null;
  forbiddenTopics: Prisma.JsonValue | null;
  ctaStyle: string | null;
  preferredLength: number;
  createdAt: Date;
  updatedAt: Date;
}): AccountProfileData {
  return {
    id: profile.id,
    accountId: profile.accountId,
    ...toInput(profile),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function toVersionItem(version: {
  id: string;
  accountId: string;
  profileSnapshot: Prisma.JsonValue;
  createdAt: Date;
}): AccountProfileVersionItem {
  const snapshot = version.profileSnapshot as Partial<AccountProfileInput>;
  return {
    id: version.id,
    accountId: version.accountId,
    profileSnapshot: sanitizeProfileInput(snapshot),
    createdAt: version.createdAt.toISOString(),
  };
}

function buildDefaultProfile(params: {
  accountName: string;
  categoryNames: string[];
}): AccountProfileInput {
  const categoryText = params.categoryNames.length > 0 ? params.categoryNames.join(' / ') : '通用热点';

  return {
    ...DEFAULT_PROFILE,
    audience: `关注${categoryText}并希望快速获取决策信息的读者`,
    contentPromise: `${params.accountName} 提供结构化热点分析、可执行建议与后续跟进视角`,
  };
}

async function persistVersion(
  tx: Prisma.TransactionClient,
  profile: {
    id: string;
    accountId: string;
    audience: string;
    tone: string;
    growthGoal: string;
    painPoints: Prisma.JsonValue | null;
    contentPromise: string | null;
    forbiddenTopics: Prisma.JsonValue | null;
    ctaStyle: string | null;
    preferredLength: number;
  }
) {
  await tx.accountProfileVersion.create({
    data: {
      accountId: profile.accountId,
      accountProfileId: profile.id,
      profileSnapshot: toInput(profile) as unknown as Prisma.InputJsonValue,
    },
  });

  const stale = await tx.accountProfileVersion.findMany({
    where: {
      accountId: profile.accountId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    skip: MAX_PROFILE_HISTORY,
    select: {
      id: true,
    },
  });

  if (stale.length > 0) {
    await tx.accountProfileVersion.deleteMany({
      where: {
        id: {
          in: stale.map((item: { id: string }) => item.id),
        },
      },
    });
  }
}

export function sanitizeProfileInput(input: Partial<AccountProfileInput> | undefined): AccountProfileInput {
  const fallback = DEFAULT_PROFILE;

  return {
    audience: normalizeText(input?.audience, fallback.audience, 160),
    tone: normalizeText(input?.tone, fallback.tone, 80),
    growthGoal: normalizeText(input?.growthGoal, fallback.growthGoal, 40),
    painPoints: normalizeStringArray(input?.painPoints, 8).slice(0, 8),
    contentPromise: normalizeText(input?.contentPromise, fallback.contentPromise || '', 300) || undefined,
    forbiddenTopics: normalizeStringArray(input?.forbiddenTopics, 10),
    ctaStyle: normalizeText(input?.ctaStyle, fallback.ctaStyle || '', 120) || undefined,
    preferredLength: normalizeLength(input?.preferredLength, fallback.preferredLength),
  };
}

export function mergeProfile(
  base: AccountProfileInput,
  override: Partial<AccountProfileInput> | undefined
): AccountProfileInput {
  if (!override) {
    return base;
  }

  return sanitizeProfileInput({
    ...base,
    ...override,
    painPoints: override.painPoints ?? base.painPoints,
    forbiddenTopics: override.forbiddenTopics ?? base.forbiddenTopics,
  });
}

export async function getOrCreateAccountProfile(accountId: string): Promise<AccountProfileData> {
  const existed = await prisma.accountProfile.findUnique({
    where: {
      accountId,
    },
  });

  if (existed) {
    return toProfileData(existed);
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      categories: {
        include: {
          category: true,
        },
      },
    },
  });

  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const profileInput = buildDefaultProfile({
    accountName: account.name,
    categoryNames: account.categories.map((item) => item.category.name),
  });

  const profile = await prisma.$transaction(async (tx) => {
    const created = await tx.accountProfile.create({
      data: {
        accountId: account.id,
        audience: profileInput.audience,
        tone: profileInput.tone,
        growthGoal: profileInput.growthGoal,
        painPoints: profileInput.painPoints as Prisma.InputJsonValue,
        contentPromise: profileInput.contentPromise,
        forbiddenTopics: profileInput.forbiddenTopics as Prisma.InputJsonValue,
        ctaStyle: profileInput.ctaStyle,
        preferredLength: profileInput.preferredLength,
      },
    });

    await persistVersion(tx, created);
    return created;
  });

  return toProfileData(profile);
}

export async function getAccountProfileWithVersions(accountId: string): Promise<{
  profile: AccountProfileData;
  versions: AccountProfileVersionItem[];
}> {
  const profile = await getOrCreateAccountProfile(accountId);

  const versions = await prisma.accountProfileVersion.findMany({
    where: {
      accountId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: MAX_PROFILE_HISTORY,
  });

  return {
    profile,
    versions: versions.map(toVersionItem),
  };
}

export async function listAccounts(options?: { includeInactive?: boolean }): Promise<AccountListItem[]> {
  const accounts = await prisma.account.findMany({
    where: options?.includeInactive ? undefined : { isActive: true },
    orderBy: [
      {
        updatedAt: 'desc',
      },
      {
        createdAt: 'desc',
      },
    ],
    select: {
      id: true,
      name: true,
      platform: true,
      description: true,
      isActive: true,
      autoPublish: true,
      dailyLimit: true,
    },
  });

  return accounts;
}

export async function createAccount(input: AccountMutationInput): Promise<AccountListItem> {
  const name = normalizeAccountName(input.name);
  const platform = normalizeAccountPlatform(input.platform, 'weixin');
  const account = await prisma.account.create({
    data: {
      name,
      platform,
      description: normalizeAccountDescription(input.description),
      isActive: normalizeAccountFlag(input.isActive, true),
      autoPublish: normalizeAccountFlag(input.autoPublish, false),
      dailyLimit: normalizeAccountDailyLimit(input.dailyLimit, 3),
    },
    select: {
      id: true,
      name: true,
      platform: true,
      description: true,
      isActive: true,
      autoPublish: true,
      dailyLimit: true,
    },
  });

  return account;
}

export async function updateAccount(
  accountId: string,
  input: AccountMutationInput
): Promise<AccountListItem> {
  const existing = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      platform: true,
      description: true,
      isActive: true,
      autoPublish: true,
      dailyLimit: true,
    },
  });

  if (!existing) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const account = await prisma.account.update({
    where: {
      id: accountId,
    },
    data: {
      name:
        input.name === undefined
          ? undefined
          : normalizeAccountName(input.name, existing.name),
      platform:
        input.platform === undefined
          ? undefined
          : normalizeAccountPlatform(input.platform, existing.platform),
      description:
        input.description === undefined ? undefined : normalizeAccountDescription(input.description),
      isActive:
        input.isActive === undefined ? undefined : normalizeAccountFlag(input.isActive, existing.isActive),
      autoPublish:
        input.autoPublish === undefined
          ? undefined
          : normalizeAccountFlag(input.autoPublish, existing.autoPublish),
      dailyLimit:
        input.dailyLimit === undefined
          ? undefined
          : normalizeAccountDailyLimit(input.dailyLimit, existing.dailyLimit),
    },
    select: {
      id: true,
      name: true,
      platform: true,
      description: true,
      isActive: true,
      autoPublish: true,
      dailyLimit: true,
    },
  });

  return account;
}

export async function updateAccountProfile(
  accountId: string,
  input: Partial<AccountProfileInput>
): Promise<{ profile: AccountProfileData; versions: AccountProfileVersionItem[] }> {
  const existing = await getOrCreateAccountProfile(accountId);
  const next = mergeProfile(existing, input);

  const profile = await prisma.$transaction(async (tx) => {
    const updated = await tx.accountProfile.update({
      where: {
        accountId,
      },
      data: {
        audience: next.audience,
        tone: next.tone,
        growthGoal: next.growthGoal,
        painPoints: next.painPoints as Prisma.InputJsonValue,
        contentPromise: next.contentPromise,
        forbiddenTopics: next.forbiddenTopics as Prisma.InputJsonValue,
        ctaStyle: next.ctaStyle,
        preferredLength: next.preferredLength,
      },
    });

    await persistVersion(tx, updated);
    return updated;
  });

  const versions = await prisma.accountProfileVersion.findMany({
    where: {
      accountId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: MAX_PROFILE_HISTORY,
  });

  return {
    profile: toProfileData(profile),
    versions: versions.map(toVersionItem),
  };
}

export async function rollbackAccountProfile(
  accountId: string,
  versionId: string
): Promise<{ profile: AccountProfileData; versions: AccountProfileVersionItem[] }> {
  const version = await prisma.accountProfileVersion.findUnique({
    where: {
      id: versionId,
    },
  });

  if (!version || version.accountId !== accountId) {
    throw new Error('Profile version not found.');
  }

  const snapshot = sanitizeProfileInput(version.profileSnapshot as Partial<AccountProfileInput>);
  return updateAccountProfile(accountId, snapshot);
}
