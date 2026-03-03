import wechatDraftPromptConfigJson from '@/lib/pipeline/prompts/wechat-draft.config.json';

export interface WechatDraftPromptConfig {
  templateVersion: string;
  systemPrompt: string[];
  generationRequirements: string[];
  diversity: {
    initial: string;
    regenerate: string[];
  };
  outputSchemaInstruction: string;
}

const DEFAULT_WECHAT_DRAFT_PROMPT_CONFIG: WechatDraftPromptConfig = {
  templateVersion: 'wechat-v3-social-ready',
  systemPrompt: [
    '你是一名中文社交媒体增长编辑，目标是产出“可直接发布、可读、可转发”的热点内容。',
    '请优先保证读者体验：具体、简洁、有信息增量，避免教程腔和空话。',
    '必须遵守：',
    '1) 事实与观点分离，不能捏造未给出的事实；',
    '2) 对不确定信息明确标注“待核实”，不能写成确定语气；',
    '3) 优先使用短句和短段，确保手机端快速阅读；',
    '4) 输出内容要可直接发布为 Markdown。',
  ],
  generationRequirements: [
    '1) 标题 18-30 字，包含“具体对象 + 关键冲突/反差 + 读者收益”，禁止“从X看Y”模板标题；',
    '2) 正文 {{lengthMin}}-{{lengthMax}} 字（目标约 {{lengthTarget}} 字），首段不超过 120 字；',
    '3) 使用 4-6 个二级小标题，标题口语化，禁止机械结构（如“一、二、三”“首先/其次/最后”）；',
    '4) 每段只讲一个观点，建议 40-120 字；避免连续 3 句以上长句；',
    '5) 至少 3 个可验证事实点（带平台/时间/排名/数据），并明确 1 个“待核实”信息边界；',
    '6) 每个分析段都要回答一句“这对读者意味着什么”；',
    '7) 给出 3 条可执行建议，统一格式：`- 动作：...｜适用场景：...｜成本：...｜预期收益：...`；',
    '8) 结尾只保留 1 个互动问题，避免“求关注/下篇预告”式硬性 CTA；',
    '9) 禁止空洞表达：信息过载、情绪消耗、长期红利、围观变能力、先声明等泛化句。',
    '10) 文末补充“可转发摘要”1句（不超过36字）+ 2-3 个强相关标签，禁止无关标签堆砌。',
  ],
  diversity: {
    initial: '这是首稿，可聚焦当前最具传播价值的分析角度。',
    regenerate: [
      '这是重生稿，必须与上一个版本保持明显差异。',
      '上稿标题：{{previousTitle}}',
      '上稿大纲：{{previousOutline}}',
      '要求本稿至少在“核心观点、开场路径、段落结构”中改变两项，禁止同义改写。',
    ],
  },
  outputSchemaInstruction: '请只输出 JSON：{"title":"","outline":[""],"content":""}',
};

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function toText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

function parseWechatDraftPromptConfig(raw: unknown): WechatDraftPromptConfig {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_WECHAT_DRAFT_PROMPT_CONFIG;
  }

  const input = raw as Record<string, unknown>;
  const diversity =
    input.diversity && typeof input.diversity === 'object'
      ? (input.diversity as Record<string, unknown>)
      : null;

  return {
    templateVersion:
      toText(input.templateVersion) ?? DEFAULT_WECHAT_DRAFT_PROMPT_CONFIG.templateVersion,
    systemPrompt:
      toStringArray(input.systemPrompt) ?? DEFAULT_WECHAT_DRAFT_PROMPT_CONFIG.systemPrompt,
    generationRequirements:
      toStringArray(input.generationRequirements) ??
      DEFAULT_WECHAT_DRAFT_PROMPT_CONFIG.generationRequirements,
    diversity: {
      initial:
        toText(diversity?.initial) ??
        DEFAULT_WECHAT_DRAFT_PROMPT_CONFIG.diversity.initial,
      regenerate:
        toStringArray(diversity?.regenerate) ??
        DEFAULT_WECHAT_DRAFT_PROMPT_CONFIG.diversity.regenerate,
    },
    outputSchemaInstruction:
      toText(input.outputSchemaInstruction) ??
      DEFAULT_WECHAT_DRAFT_PROMPT_CONFIG.outputSchemaInstruction,
  };
}

const wechatDraftPromptConfig = parseWechatDraftPromptConfig(
  wechatDraftPromptConfigJson
);

export function getWechatDraftPromptConfig(): WechatDraftPromptConfig {
  return wechatDraftPromptConfig;
}
