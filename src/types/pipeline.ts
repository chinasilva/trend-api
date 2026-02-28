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
