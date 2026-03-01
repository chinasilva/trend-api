import {
  DraftStatus,
  OpportunityStatus,
  PublishJobStatus,
  RiskLevel,
} from '@prisma/client';

export interface TopicEvidence {
  platform: string;
  title: string;
  url?: string;
  rank: number;
  hotValue?: number;
  snapshotAt: string;
}

export interface TopicClusterInput {
  fingerprint: string;
  title: string;
  keywords: string[];
  evidences: TopicEvidence[];
  resonanceCount: number;
  growthScore: number;
  persistenceScore: number;
  latestSnapshotAt: Date;
  windowStart: Date;
  windowEnd: Date;
}

export interface OpportunityScoreResult {
  score: number;
  reasons: string[];
}

export interface DraftGenerationResult {
  draftId: string;
  title: string;
  status: DraftStatus;
  riskLevel: RiskLevel;
  riskScore: number;
  model: string;
  qualityReport: DraftQualityReport;
  contentPack: DraftContentPack;
  generationTrace: DraftGenerationTrace;
}

export interface AccountProfileInput {
  audience: string;
  tone: string;
  growthGoal: string;
  painPoints: string[];
  contentPromise?: string;
  forbiddenTopics: string[];
  ctaStyle?: string;
  preferredLength: number;
}

export interface AccountProfileData extends AccountProfileInput {
  id: string;
  accountId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountProfileVersionItem {
  id: string;
  accountId: string;
  profileSnapshot: AccountProfileInput;
  createdAt: string;
}

export interface DraftQualityReport {
  score: number;
  dimensions: {
    relevance: number;
    evidence: number;
    readability: number;
    growthPotential: number;
    accountFit: number;
  };
  warnings: string[];
}

export interface DraftContentPack {
  coreAngle: string;
  targetReader: string;
  hook: string;
  sections: Array<{
    title: string;
    goal: string;
  }>;
  cta: string;
  followupIdeas: string[];
}

export interface DraftGenerationTrace {
  topicScore: number;
  accountFit: number;
  modelScore: number;
  fusionScore: number;
}

export interface DraftImagePlaceholder {
  slot: number;
  purpose: string;
  prompt: string;
  placementAnchor: string;
  altText: string;
}

export interface RegenerationData {
  parentDraftId: string;
  regenerationIndex: number;
  diversityChecks: string[];
}

export interface SyncOpportunitiesResult {
  clustersUpserted: number;
  opportunitiesUpserted: number;
  skippedAccounts: number;
  sourceCount: number;
  windowStart: string;
  windowEnd: string;
}

export interface PublishJobResult {
  id: string;
  status: PublishJobStatus;
  deliveryStage: 'draftbox' | 'published';
  attempt: number;
  externalId?: string;
  errorMessage?: string | null;
}

export const OPPORTUNITY_STATUSES = Object.values(OpportunityStatus);
export const DRAFT_STATUSES = Object.values(DraftStatus);
export const PUBLISH_JOB_STATUSES = Object.values(PublishJobStatus);
