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
  synthesisReportId?: string | null;
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
  windows?: Array<{
    label: string;
    hours: number;
    weight: number;
  }>;
}

export interface RealtimeOpportunityWindowSummary {
  label: '24h' | '72h' | '168h';
  hours: number;
  weight: number;
}

export interface RealtimeOpportunityComputeData {
  sessionId: string;
  accountId: string;
  reused: boolean;
  expiresAt: string;
  topN: number;
  counts: {
    snapshotCount: number;
    clusterCount: number;
    candidateCount: number;
    storedCount: number;
  };
  windows: RealtimeOpportunityWindowSummary[];
}

export interface RealtimeOpportunityGenerateData {
  sessionId: string;
  consumedAt: string;
  opportunityId: string;
  topicClusterId: string;
  draft: DraftGenerationData;
}

export interface PublishJobResult {
  id: string;
  status: PublishJobStatus;
  deliveryStage: PublishDeliveryStage;
  attempt: number;
  externalId?: string;
  errorMessage?: string | null;
}

export interface TopicSynthesisSourceItem {
  platform: string;
  title: string;
  url?: string;
  reason: string;
  score?: number;
}

export interface TopicSynthesisReportItem {
  id: string;
  accountId: string;
  finalTopic: string;
  oneLiner?: string;
  sourceItems: TopicSynthesisSourceItem[];
  mergeRationale: string[];
  selectionRationale: string[];
  accountFitReason?: string;
  traceScores: Record<string, number>;
  riskDowngradeTrace: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TopicResearchItem {
  id: string;
  accountId: string;
  synthesisReportId: string;
  querySet: string[];
  sources: Array<{
    title: string;
    url?: string;
    snippet: string;
    language: 'zh' | 'en' | 'other';
  }>;
  languageMix: string;
  retryCount: number;
  fallbackUsed: boolean;
  createdAt: string;
}

export interface DraftSynthesisReportData {
  report: TopicSynthesisReportItem;
  researches: TopicResearchItem[];
}

export interface AccountListItem {
  id: string;
  name: string;
  platform: string;
  description?: string | null;
  isActive: boolean;
  autoPublish: boolean;
  dailyLimit: number;
  autoGenerateEnabled?: boolean;
  autoGenerateTime?: string | null;
  autoGenerateLeadMinutes?: number;
  autoGenerateTimezone?: string;
  lastAutoGenerateAt?: string | null;
}

export interface AccountMutationInput {
  name?: string;
  platform?: string;
  description?: string;
  isActive?: boolean;
  autoPublish?: boolean;
  dailyLimit?: number;
  autoGenerateEnabled?: boolean;
  autoGenerateTime?: string | null;
  autoGenerateLeadMinutes?: number;
  autoGenerateTimezone?: string;
}

export const OPPORTUNITY_STATUS_OPTIONS: OpportunityStatus[] = [
  'NEW',
  'SELECTED',
  'EXPIRED',
  'DISCARDED',
];
