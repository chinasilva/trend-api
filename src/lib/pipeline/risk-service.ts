import { DraftStatus, RiskLevel } from '@prisma/client';

export interface RiskEvaluation {
  riskLevel: RiskLevel;
  riskScore: number;
  reasons: string[];
  suggestedStatus: DraftStatus;
}

const HIGH_RISK_TERMS = ['赌博', '色情', '毒品', '暴力', '恐怖', '诈骗', '仇恨'];
const MEDIUM_RISK_TERMS = ['内幕', '爆料', '传闻', '谣言', '玄学', '偏方'];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function countTerms(text: string, terms: string[]) {
  return terms.reduce((count, term) => (text.includes(term) ? count + 1 : count), 0);
}

export function evaluateDraftRisk(input: {
  title: string;
  content: string;
  policy?: 'balanced' | 'strict' | 'growth';
}): RiskEvaluation {
  const policy = input.policy ?? 'balanced';
  const text = `${input.title}\n${input.content}`.toLowerCase();

  const highHits = countTerms(text, HIGH_RISK_TERMS);
  const mediumHits = countTerms(text, MEDIUM_RISK_TERMS);

  const rawScore = clamp(0.2 + highHits * 0.45 + mediumHits * 0.2, 0, 1);
  const reasons: string[] = [];

  if (highHits > 0) {
    reasons.push(`high-risk-term:${highHits}`);
  }
  if (mediumHits > 0) {
    reasons.push(`medium-risk-term:${mediumHits}`);
  }

  if (highHits > 0) {
    return {
      riskLevel: RiskLevel.HIGH,
      riskScore: rawScore,
      reasons,
      suggestedStatus: DraftStatus.BLOCKED,
    };
  }

  if (policy === 'strict' && (mediumHits > 0 || rawScore >= 0.45)) {
    return {
      riskLevel: RiskLevel.MEDIUM,
      riskScore: rawScore,
      reasons: reasons.length > 0 ? reasons : ['strict-policy-review'],
      suggestedStatus: DraftStatus.REVIEW,
    };
  }

  if (policy === 'growth') {
    return {
      riskLevel: mediumHits > 0 ? RiskLevel.MEDIUM : RiskLevel.LOW,
      riskScore: rawScore,
      reasons,
      suggestedStatus: mediumHits > 1 ? DraftStatus.REVIEW : DraftStatus.READY,
    };
  }

  if (mediumHits > 0 || rawScore >= 0.5) {
    return {
      riskLevel: RiskLevel.MEDIUM,
      riskScore: rawScore,
      reasons: reasons.length > 0 ? reasons : ['balanced-policy-review'],
      suggestedStatus: DraftStatus.REVIEW,
    };
  }

  return {
    riskLevel: RiskLevel.LOW,
    riskScore: rawScore,
    reasons,
    suggestedStatus: DraftStatus.READY,
  };
}
