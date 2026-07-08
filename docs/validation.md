# AIHot 验证记录

更新日期：2026-07-08

## 验证范围

- Web 版本地服务启动与 API 可用性。
- 关键词监控、热点范围和信息源配置的状态读取。
- 手动刷新任务的端到端接口调用。
- 响应式页面在桌面与 390px 窄屏下的基础可用性。
- Agent Skill 元数据结构校验。
- 环境变量模板与敏感文件忽略规则。

## 验证结果

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| `npm test` | 通过 | 11 个 `node:test` 用例全部通过；新增覆盖 SiliconFlow 默认 Provider、占位 Key 识别、OpenRouter 切换。 |
| `GET /api/state` | 通过 | 返回 8 个信息源，并返回 `aiProvider=siliconflow`、`model=deepseek-ai/DeepSeek-V3.2`、`hasAiKey=false`。 |
| `POST /api/refresh` | 通过 | 返回 HTTP 200；热点范围生成 8 个主题。 |
| 信息源容错 | 通过 | 当前网络下 Google News、DuckDuckGo 报 `fetch failed`，但任务继续完成。 |
| 国内源 smoke test | 通过 | `collectSources("AI")` 返回 Bing、Hacker News、GitHub、Sogou Weixin、Bilibili 共 40 条候选；Weibo 当前需要访客校验，作为源级错误展示且未影响整体流程。 |
| 桌面页面渲染 | 通过 | 浏览器可见标题、关键词监控、热点范围、立即扫描、信息源条。 |
| Provider 前端状态 | 通过 | 页面显示 `SiliconFlow 未配置 · 本地规则回退`，并展示 8 个信息源。 |
| 窄屏响应式 | 通过 | 390px 视口下无横向溢出，核心控件仍可见。 |
| `.env.example` | 通过 | 包含 `AI_PROVIDER`、SiliconFlow、OpenRouter、Context7 等变量模板，且仅使用占位值。 |
| `.gitignore` | 通过 | 忽略 `.env`、`.env.*`、`mcp-tokens.ps1`，保留 `.env.example`。 |
| Agent Skill 元数据 | 通过 | frontmatter 等价校验通过：`name=aihot-monitor`。 |

## 注意事项

- 当前默认 AI Provider 为 SiliconFlow；如果 `.env` 中仍是 `SILICONFLOW_API_KEY=your_siliconflow_api_key_here`，服务会运行在本地启发式回退模式。生产或高置信监控需要在本地 `.env` 中配置真实 SiliconFlow Key。
- `skill-creator` 自带的 `quick_validate.py` 依赖 PyYAML。当前两个本地 Python 环境都未安装 `yaml` 模块，因此本次使用等价 frontmatter 校验；如需严格运行官方校验器，需要先安装 PyYAML。
- 当前网络环境下部分公开信息源不可达，页面会展示源级错误；这是预期容错行为。
- 国内公开入口可能受平台反爬、网络、验证码或结果页结构变化影响。后续如需稳定生产监控，应优先接入官方 API、付费 API 或用户确认的合规第三方服务。
