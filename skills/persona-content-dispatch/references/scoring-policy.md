# Scoring Policy

1. 窗口加权：24h/3d/7d = 0.65/0.25/0.10。
2. 账号匹配：先硬过滤无关赛道，再软加权 personaFit。
3. 风险预检：高风险词降低最终分。
4. 进入机会池：最终分 >= OPPORTUNITY_MIN_SCORE。
