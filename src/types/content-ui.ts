export type OpportunityStatus = 'NEW' | 'SELECTED' | 'EXPIRED' | 'DISCARDED';
export type DraftStatus = 'DRAFT' | 'REVIEW' | 'BLOCKED' | 'READY' | 'SUBMITTED' | 'PUBLISHED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type PublishJobStatus = 'QUEUED' | 'RUNNING' | 'REVIEW' | 'SUCCESS' | 'FAILED' | 'CANCELED';
export type PublishDeliveryStage = 'draftbox' | 'published';

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface OpportunityItem {
  id: string;
  accountId: string;
  topicClusterId: string;
  score: number;
  reasons: string[];
  status: OpportunityStatus;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  account: {
    id: string;
    name: string;
    platform: string;
  };
  topicCluster: {
    id: string;
    title: string;
    resonanceCount: number;
    growthScore: number;
    latestSnapshotAt: string;
  };
}

export interface OpportunityListData {
  items: OpportunityItem[];
  pagination: Pagination;
}

export interface DraftGenerationData {
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

export interface PublishJobItem {
  id: string;
  provider: string;
  status: PublishJobStatus;
  deliveryStage: PublishDeliveryStage;
  attempt: number;
  externalId: string | null;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftDetail {
  id: string;
  title: string;
  content: string;
  outline: string[];
  templateVersion: string;
  model: string;
  status: DraftStatus;
  riskLevel: RiskLevel;
  riskScore: number;
  qualityReport?: DraftQualityReport;
  contentPack?: DraftContentPack;
  generationTrace?: DraftGenerationTrace;
  imagePlaceholders?: DraftImagePlaceholder[];
  regeneration?: RegenerationData;
  createdAt: string;
  updatedAt: string;
  account: {
    id: string;
    name: string;
    platform: string;
  };
  opportunity: {
    id: string;
    score: number;
    status: OpportunityStatus;
    topicCluster: {
      id: string;
      title: string;
      resonanceCount: number;
      growthScore: number;
      latestSnapshotAt: string;
    };
  };
  publishJobs: PublishJobItem[];
}

export interface SyncOpportunitiesData {
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
  deliveryStage: PublishDeliveryStage;
  attempt: number;
  externalId?: string;
  errorMessage?: string | null;
}

export const OPPORTUNITY_STATUS_OPTIONS: OpportunityStatus[] = [
  'NEW',
  'SELECTED',
  'EXPIRED',
  'DISCARDED',
];
