# AIHot 技术方案

更新日期：2026-07-08

## 执行原则

- 先文档，后开发。
- 先 Context7 MCP 查证最新 API/技术实现，再写代码。
- 每个阶段都保留人工确认点。
- 优先沿用现有项目结构，避免引入不必要依赖。
- 任何外部 API 调用都要有超时、错误处理和可降级路径。
- 真实密钥只放在本地 `.env` 或本地 token 脚本中；仓库只提交 `.env.example`。

## Context7 MCP 状态

本轮已执行的检查：

- 使用工具发现检索 `context7`、`resolve-library`、`get-library-docs`，未发现可直接调用的 Context7 MCP 工具。
- 使用 Codex CLI 检查 MCP 配置，初始结果为未配置任何 MCP server。
- 已尝试注册全局 MCP server：`context7`，URL 为 `https://mcp.context7.com/mcp`，认证方式为 `CONTEXT7_API_KEY` 环境变量。
- 注册命令返回过成功提示，但随后 `mcp list` 仍显示未配置任何 MCP server，`mcp get context7` 也未找到该 server。
- 注册后再次执行工具发现，当前线程仍未暴露 Context7 文档工具。
- 已通过 Context7 MCP Streamable HTTP 协议直接完成 `initialize`、`tools/list`、`resolve-library-id` 和 `query-docs` 调用。
- Context7 server 版本：3.2.3。

开发闸门：

- 已完成本次所需的 Context7 查询，可以进入本次已确认范围的代码开发。
- 后续如引入新依赖或接入新的外部 API，需要再次通过 Context7 查询。

## Context7 查询结论

| 查询对象 | Context7 library id | 查询主题 | 关键结论 | 对实现方案的影响 |
| --- | --- | --- | --- | --- |
| Node.js | `/nodejs/node` | 全局 `fetch`、`AbortController`、超时与响应处理 | Node.js v18+ 可直接使用全局 `fetch`；`fetch` 只有网络失败才 reject，HTTP 4xx/5xx 需要检查 `response.ok`；请求可用 `AbortSignal` 取消。 | 继续使用 Node.js 内置 `fetch`，不引入 HTTP 客户端依赖；保留超时和 `response.ok` 检查。 |
| OpenRouter | `/websites/openrouter_ai` | Chat Completions、JSON 输出、请求 header 和错误格式 | Chat Completions 支持 `response_format: { type: "json_object" }`；可设置 `provider.require_parameters: true`，要求供应商支持指定参数；错误可能出现在 HTTP 响应或 `choices[].error`。 | 当前 `response_format` 方向正确；后续 AI 调用可补充 `provider.require_parameters` 并增强 choices 级错误处理。 |

## 当前架构

```text
server.js
  ├─ public/index.html
  ├─ public/styles.css
  ├─ public/app.js
  └─ src/
      ├─ ai.js          AI Provider 调用与本地回退
      ├─ jobs.js        监控/热点任务调度
      ├─ sources.js     Google News、Hacker News、GitHub 数据源
      ├─ store.js       data/state.json 读写
      └─ utils.js       工具函数
```

## 环境变量管理

- `.env.example`：提交到仓库，只保留变量名和示例值，供其他开发者复制配置。
- `.env`：本地真实配置，绝不提交。
- `.env.*`：本地环境变体，默认不提交。
- `mcp-tokens.ps1`：本机 MCP/API token 脚本，绝不提交。

当前模板变量：

| 变量名 | 用途 | 是否必填 |
| --- | --- | --- |
| `PORT` | Web 服务端口 | 否 |
| `POLL_SECONDS` | 后台调度检查间隔 | 否 |
| `AI_PROVIDER` | AI Provider：`siliconflow` 或 `openrouter` | 否，默认 `siliconflow` |
| `SILICONFLOW_API_KEY` | SiliconFlow API Key | 生产建议必填 |
| `SILICONFLOW_MODEL` | SiliconFlow 模型名 | 否，默认 `deepseek-ai/DeepSeek-V3.2` |
| `OPENROUTER_API_KEY` | OpenRouter API Key | 切换到 OpenRouter 时填写 |
| `OPENROUTER_MODEL` | OpenRouter 模型名 | 否 |
| `CONTEXT7_API_KEY` | Context7 MCP 文档查询 token | 开发时按需 |
| `FIRECRAWL_API_KEY` | Firecrawl 等扩展工具 token | 开发时按需 |

## 信息源接入候选

| 信息源 | 建议接入优先级 | 接入方式待确认 | 主要风险 |
| --- | --- | --- | --- |
| HackerNews | 高 | Algolia API 已在当前项目中使用 | 低，继续沿用现有实现即可 |
| Bing | 高 | 搜索结果页、RSS 或官方 API | 无 Key 方案可能受页面结构变化影响 |
| DuckDuckGo | 高 | HTML 搜索、轻量聚合库或官方可用接口 | 需要确认稳定性与请求频率 |
| Google | 中 | Google News RSS 或 Custom Search API | 搜索 API 可能需要 Key，RSS 覆盖范围有限 |
| 微博 | 中 | 热搜榜/搜索页/开放平台 | 反爬、登录态和平台规则风险 |
| B 站 | 中 | 搜索接口、排行榜或公开视频接口 | 接口稳定性和频率限制 |
| 搜狗 | 中 | 微信搜索结果页 | 页面结构变化、反爬和内容可访问性 |
| Twitter | 低 | 官方 API 或合规第三方服务 | 需要 API Key，成本和权限需确认 |

默认建议：

- 第一阶段优先补充不需要 API Key、适合公开抓取或公开接口的信息源：Bing、DuckDuckGo，并保留现有 HackerNews。
- Twitter 先作为后续增强项，等用户确认 API Key、费用、权限和使用边界后再设计。
- 国内社交/内容平台先做可行性验证，不在未确认合规方式前直接写抓取代码。

本次实现：

- 接入 Bing Search RSS，作为 Bing 信息源的无 Key 第一版。
- 接入 DuckDuckGo HTML 搜索，解析标题、链接和摘要。
- 保持每个信息源独立失败，不影响其他源返回。
- 新增解析函数单元测试，避免依赖真实网络。

## 建议主线

短期建议继续使用当前生产入口：

- `server.js`
- `src/jobs.js`
- `src/ai.js`
- `src/sources.js`
- `src/store.js`
- `public/*`

原因：

- `package.json` 使用 `"type": "commonjs"`。
- `server.js` 当前引用的是 CommonJS 模块。
- 现有测试覆盖的是 CommonJS 模块。
- `src/app.js` 使用 ESM 语法，在当前包类型下不是主运行路径。

`src/app.js` 的处理需要用户确认：

- 选项 A：保留但暂不使用，仅在后续架构整理时处理。
- 选项 B：删除或迁移为 CommonJS。
- 选项 C：整体项目迁移到 ESM。

默认建议：选项 A，先完成用户确认的功能需求，避免扩大改动面。

## 待 Context7 查询的文档

根据最终需求，至少需要查询：

- OpenRouter API 文档：Chat Completions、JSON 输出、模型参数、错误格式、推荐 header。
- Node.js 官方/运行时相关文档：如涉及 `fetch`、AbortController、`node:test` 或 HTTP server 行为。
- 新增库文档：如果用户确认要引入任何新依赖，必须先通过 Context7 查询最新用法。

查询完成后，需要在本节追加：

- Context7 library id。
- 查询主题。
- 关键结论。
- 对实现方案的影响。

## 实施步骤

1. 需求冻结
   - 用户补充本次具体功能。
   - 更新 `docs/requirements.md`。
   - 等待用户确认。

2. 文档查证
   - 使用 Context7 MCP 查询相关 API/库文档。
   - 将关键结论追加到本文件。
   - 等待用户确认。

3. 设计落地
   - 确认接口、数据结构、错误处理和 UI 影响。
   - 明确会改动的文件清单。

4. 代码实现
   - 按确认后的文件清单做最小必要改动。
   - 新增或更新测试。
   - 避免泄露密钥。

5. 验证
   - 运行 `npm test`。
   - 如涉及页面，启动本地服务并验证核心交互。
   - 记录验证结果。

## 风险与处理

- Context7 工具未在当前线程暴露且 CLI 配置未确认成功：暂停开发，等待用户确认 MCP 配置方式、刷新会话，或允许改用其他官方文档查询方式。
- 中文乱码影响用户体验和测试可读性：建议作为单独任务修复，避免混入业务功能开发。
- CommonJS/ESM 双结构造成维护歧义：短期固定 CommonJS 主线，长期再做架构统一。
- 外部源限流或网络不可用：保留来源级错误展示和部分成功策略。
- AI Provider 调用失败：保留本地启发式回退，但在页面中显示 provider/error 状态。

## 当前状态

- 需求文档已创建。
- 技术方案文档已创建。
- Context7 已尝试注册，但 CLI 尚未确认配置成功。
- 当前线程仍未暴露 Context7 文档调用工具。
- 等待用户提供具体功能需求，并确认如何让 Context7 MCP 在当前环境中可用。

## Sprint 2026-07-08 Web + Skill

用户已再次确认原始需求，本轮按敏捷方式继续推进，减少中间等待，最终交付给用户验收。

### 本轮目标

- 网页版先完成并可本地使用。
- 修复 Web 页面、README 和用户可见 AI 回退文案中的中文乱码。
- 保留当前雷达工作台视觉，增强页面识别度和状态可读性。
- 确认 SiliconFlow + DeepSeek 作为当前默认 AI 接入主线，OpenRouter 保留为兼容 Provider；未配置密钥时保留本地回退。
- 在网页版可用后，封装 `skills/aihot-monitor` Agent Skill，让其他 AI 能按说明复用监控与热点发现流程。

### 分步计划

1. 文档更新：把本轮范围记录到需求和方案文档。
2. Web 修复：修复 `public/index.html`、`public/app.js`、`README.md`、后端 AI 回退文案的乱码。
3. Web 验证：运行 `npm test`，启动服务检查 `/api/state`，必要时做信息源 smoke test。
4. Agent Skill：按 `skill-creator` 指南初始化并编辑 `skills/aihot-monitor`。
5. Skill 验证：运行 skill quick validate，确认技能结构有效。
6. 验收：向用户汇报变更、测试结果和待确认事项。

### 人工确认点

- 本轮采用轻量确认：开发前已根据用户“继续开发”的指令进入实现。
- 开发完成后请用户验收网页版体验和 Agent Skill 内容。

## Sprint 2026-07-08 国内信息源补充

用户确认把此前截图中的国内信息源也加入信息源列表。本轮新增范围：

- 搜狗微信：用于微信公众号文章候选内容发现。
- B 站：用于国内科技/视频内容候选内容发现。
- 微博：用于国内热点与社交讨论候选内容发现。

### Context7 查询记录

| 查询对象 | Context7 library id | 查询主题 | 关键结论 | 实现影响 |
| --- | --- | --- | --- | --- |
| Bilibili API Collect | `/socialsisteryi/bilibili-api-collect` | video search web interface parameters response fields | 搜索结果包含 `result` 视频数组，可取得标题、作者、发布时间、播放量、URL 等字段。 | 第一版接入 B 站公开 Web 搜索 JSON 接口，解析视频结果，不引入新依赖。 |
| Bilibili Open Platform | `/websites/open_bilibili` | search content API authentication requirements | 官方开放平台能力需要身份认证、应用和审核，协议要求遵守数据保护和平台规则。 | 本轮不接入需要账号授权的官方开放平台能力，仅做公开候选源。 |
| Weibo Open Platform Business API | `/websites/open_weibo_wiki_c_2` | statuses search or hot topics REST API authentication and parameters | 微博关键词内容搜索存在商业 API `search/statuses/limited`，属于付费 API；其他接口通常需要 OAuth access token。 | 本轮不把未配置凭据的微博官方 API 写死进项目，先接入公开搜索页候选源，并保留源级失败隔离。 |
| Wechat Sogou | `/chyroc/wechatsogou` | search article keyword methods parameters and captcha or rate limit notes | `search_article` 语义支持按关键词搜索微信公众号文章，结果包含标题、摘要、链接、发布时间和公众号来源。 | 项目继续保持 Node.js 轻量实现，解析搜狗微信公开搜索结果页，不引入 Python 爬取库。 |

### 实现策略

- 新增 `Bilibili`、`Sogou Weixin`、`Weibo` 三个 source。
- 所有国内源都作为“候选内容源”，仍由当前 AI Provider 或本地 fallback 做相关性、仿冒/钓鱼、热点强度判断。
- 不保存 Cookie，不模拟登录，不处理验证码，不绕过平台限制。
- 任一国内源失败时只记录 `sourceErrors`，不影响其他源返回。
- 源列表统一由 `src/sources.js` 导出，避免 `jobs.js` 和抓取实现之间重复维护。

### 验收标准

- `/api/state` 的 `config.sources` 包含 `Sogou Weixin`、`Bilibili`、`Weibo`。
- `collectSources()` 会并发尝试新增国内源，失败时进入 `errors`。
- 新增解析函数单元测试，不依赖真实网络。
- README、需求文档、验证记录同步更新。

## Sprint 2026-07-08 SiliconFlow / DeepSeek 接入

用户确认希望把 AI Provider 从单一 OpenRouter 扩展为可切换 Provider，并准备通过 SiliconFlow 接入 DeepSeek。

### Context7 查询记录

| 查询对象 | Context7 library id | 查询主题 | 关键结论 | 实现影响 |
| --- | --- | --- | --- | --- |
| SiliconFlow Chat Completions API | `/websites/siliconflow_cn_cn_api-reference_chat-completions_chat-completions` | endpoint、Authorization、model、messages、response_format、响应结构 | SiliconFlow Chat Completions 使用 `POST https://api.siliconflow.cn/v1/chat/completions`，`Authorization: Bearer <token>`，请求体包含 `model`、`messages`，响应结构包含 `choices[].message.content`。 | 可以复用当前 OpenAI-compatible JSON 调用路径，抽象 provider 配置。 |
| SiliconFlow Model 示例 | `/websites/siliconflow_cn_cn` | DeepSeek 模型 ID 示例 | 文档示例包含 `deepseek-ai/DeepSeek-V3.2`、`Pro/deepseek-ai/DeepSeek-V3.2`、`deepseek-ai/DeepSeek-V3`。 | 默认 SiliconFlow 模型使用 `deepseek-ai/DeepSeek-V3.2`，用户可在 `.env` 中改为 Pro 或其他 DeepSeek 模型。 |

### 实现策略

- 新增 `AI_PROVIDER` 环境变量，支持 `openrouter` 和 `siliconflow`。
- OpenRouter 保留原有 `OPENROUTER_API_KEY`、`OPENROUTER_MODEL`。
- SiliconFlow 新增 `SILICONFLOW_API_KEY`、`SILICONFLOW_MODEL`。
- AI 调用统一走 OpenAI-compatible Chat Completions 封装，按 provider 选择 endpoint、headers、model。
- 前端状态不再写死 OpenRouter，改为显示当前 provider、模型和是否已配置。
- `.env.example` 只保留占位值，真实 Key 仅放 `.env`。

### 实现补充

- 默认 Provider 调整为 `siliconflow`，默认模型为 `deepseek-ai/DeepSeek-V3.2`。
- SiliconFlow 请求使用 `https://api.siliconflow.cn/v1/chat/completions`、`Authorization: Bearer <token>`、`response_format: { "type": "text" }`，并通过 system prompt 要求模型只输出 JSON，再由本地 `extractJsonObject` 容错解析。
- OpenRouter 仍使用 `response_format: { "type": "json_object" }` 和 `provider.require_parameters: true`。
- `/api/state` 的 `config` 返回 `aiProvider`、`aiProviderLabel`、`hasAiKey`、`model`，保留 `hasOpenRouterKey` 作为旧字段兼容。

## Sprint 2026-07-14 筛选与排序

用户确认本轮采用贴近日常使用的筛选与排序方式，主要作用于“命中通知 / 热点结果”列表。关键词监控管理区保持轻量，不额外增加复杂筛选器。

### 功能范围

筛选维度：

| 维度 | 可选值来源 | 实现说明 |
| --- | --- | --- |
| 信息来源 | `config.sources` 与结果中的 `item.source` / topic sources | 支持全部来源和单一来源过滤 |
| 重要性 | `urgent` / `high` / `medium` / `low` | 由 `verdict.urgency` 或 topic `heat` 映射得到 |
| 关键词 | `monitors[].keyword` | 通知列表按 `notice.keyword` 过滤；热点结果可按 scope 或标题摘要做文本匹配 |
| 时间范围 | 1 小时 / 6 小时 / 24 小时 / 7 天 / 全部 | 通知按 `createdAt`；热点报告按 `createdAt`，topic 无独立发现时间时继承报告时间 |

排序方式：

| 排序 | 数据来源 | 实现说明 |
| --- | --- | --- |
| 热度综合 | `scoreHint`、topic `heat`、AI 输出热度 | 现有候选源已提供 `scoreHint`，热点 topic 优先使用 `heat` |
| 相关性 | `verdict.confidence` | 命中通知使用 AI 置信度；热点 topic 暂无独立相关性时可回退到 `heat` |
| 最新发布 | `item.publishedAt`、topic sources 的 `publishedAt` | 无发布时间的结果排在后面 |
| 最新发现 | `createdAt` | 使用通知或报告入库时间 |
| 重要程度 | `verdict.urgency`、topic `heat` | 默认排序，分数相同时按最新发现倒序 |

### 重要性映射

当前数据结构里通知已有 `verdict.urgency` 数字字段，热点 topic 已有 `heat` 数字字段。本轮不强制修改 AI 响应 schema，前端按数值映射展示和过滤：

| 等级 | 分数范围 |
| --- | --- |
| urgent | 80-100 |
| high | 60-79 |
| medium | 40-59 |
| low | 0-39 |

### 实现策略

- 优先做前端本地筛选和排序，不新增服务端查询参数，避免扩大 API 与存储改动面。
- 在 `public/app.js` 中维护筛选状态，例如 source、importance、keyword、timeRange、sortBy。
- 在渲染通知和热点前派生 filtered/sorted 数组，原始 `state.data` 不被修改。
- 筛选控件放在主结果区顶部，保持雷达/信号工作台视觉，不改成传统后台表格。
- 信息来源和关键词选项从 `/api/state` 返回的数据动态生成，避免前后端重复写死。
- 对缺失字段做稳定降级：缺少发布时间时排到后面；缺少 urgency/heat 时按 0 处理；缺少来源时归入未知来源但默认仍显示。
- 需要新增或更新前端纯函数测试时，优先把排序/过滤逻辑抽成可测试函数；如暂不拆分测试，应至少运行 `npm test` 并做浏览器交互验证。

### 默认行为

- 默认排序：重要程度优先，分数相同时按最新发现倒序。
- 默认筛选：信息来源全部、重要性全部、关键词全部、时间范围全部。
- 刷新状态后保留当前筛选与排序选择，不因为后台轮询自动重置用户视图。

### 待确认后改动文件

- `docs/requirements.md`：记录本轮产品需求。
- `docs/technical-plan.md`：记录实现方案。
- `public/index.html`：增加筛选与排序控件。
- `public/app.js`：增加筛选状态、排序/过滤逻辑和渲染入口。
- `public/styles.css`：补充控件样式，保持当前工作台视觉。
- `tests/*`：视最终拆分方式补充排序/过滤逻辑测试。

## Sprint 2026-07-14 结果卡片信息增强

用户确认需要在结果卡片上展示更多用于人工判断价值的信息。本轮继续保持前端轻量增强，不新增后端抓取和存储字段，优先用当前 `notifications`、`hotTopics`、`item`、`verdict`、`topic`、`sources` 中已经存在的数据。

### 数据映射

通知卡片：

| 展示信息 | 数据来源 | 降级策略 |
| --- | --- | --- |
| 标题 | `verdict.notificationTitle` / `item.title` | 无标题时显示来源标题 |
| 来源 | `item.source` | 缺失时显示“未知来源” |
| 关键词 | `notice.keyword` | 缺失时不显示关键词徽标 |
| 重要性 | `verdict.urgency` 映射等级 | 缺失时按 0 分 low |
| 相关性 | `verdict.confidence` | 缺失时显示 0% |
| 热度 | `item.scoreHint` / `verdict.urgency` | 缺失时显示 0 |
| 发布时间 | `item.publishedAt` | 无法解析时显示原始字符串或“未知” |
| 发现时间 | `notice.createdAt` | 无法解析时显示“未知” |
| 原始描述 | `item.summary` | 缺失时使用 `verdict.notificationBody` 或 URL |
| AI 摘要 | `verdict.notificationBody` | 缺失时使用原始描述 |
| AI 判断理由 | `verdict.reason` | 缺失时不显示该行 |
| AI Provider | `verdict.aiProvider` / `verdict.model` | 缺失时不显示 |
| 标签 | `verdict.tags` | 缺失时不显示 |

热点卡片：

| 展示信息 | 数据来源 | 降级策略 |
| --- | --- | --- |
| 标题 | `topic.title` | 缺失时不渲染该 topic |
| 来源 | `topic.sources[].source` 或 `topic.why` | 缺失时不显示来源链接 |
| 重要性 | `topic.heat` 映射等级 | 缺失时按 0 分 low |
| 热度 | `topic.heat` | 缺失时显示 0 |
| 发布时间 | `topic.sources[].publishedAt` 最新值 | 缺失时显示未知 |
| 发现时间 | `report.createdAt` | 缺失时显示未知 |
| 原始描述 | `topic.sources[].summary` | 缺失时使用 `topic.why` |
| AI 判断理由 | `topic.why` / `topic.reason` | 缺失时不显示 |
| 风险 | `topic.risk` | 缺失时显示 unknown |

### UI 策略

- 默认卡片只展示标题、关键徽标、指标网格、原始描述和来源链接，便于快速扫描。
- 使用原生 `<details>` / `<summary>` 做展开详情，不引入新依赖。
- 展开区展示 AI 摘要、AI 判断理由、风险、Provider、标签、互动/热度数据和完整时间信息。
- 对热点 topic 继续保持双列网格；移动端按现有断点收敛为单列。
- 不增加“全部展开”按钮，避免主结果区过重。

## Sprint 2026-07-14 统一监控词、全网搜索与实时通知

本轮在不引入新依赖的前提下扩展产品工作台。继续使用 CommonJS 主线：`server.js`、`src/jobs.js`、`src/sources.js`、`public/*`。

### 统一监控词实现

- 新增后端方法 `saveWatchTerm(term, options)`，内部复用 `saveKeyword()` 和 `createScope()`。
- `createScope()` 增加同名去重，避免每次添加同一监控词都创建重复热点范围。
- `scopes` 增加可选 `enabled` 字段；调度热点范围时跳过 `enabled === false` 的范围。
- 监控词开关以 `monitor.enabled` 为主，同时同步同名 `scope.enabled`。
- 删除监控词时删除 monitor，并删除同名 scope，保持 UI 概念一致。
- 旧接口保留兼容；新增 `/api/watch-terms`、`PATCH /api/watch-terms/:id`、`DELETE /api/watch-terms/:id` 供新 UI 使用。

### 全网搜索实现

- 新增 `POST /api/search`，请求体 `{ "query": "..." }`。
- 服务端调用 `collectSources(query)`，返回 `{ query, items, errors, searchedAt }`。
- 搜索不写入 `data/state.json`，不触发 AI 判定和通知入库。
- 前端新增搜索模式和搜索结果区，复用卡片样式展示结果。

### WebSocket 实时通知实现

- 在 `server.js` 原生处理 HTTP Upgrade，不引入 `ws` 依赖。
- 服务端维护已连接 socket 集合，发送 JSON text frame。
- `src/jobs.js` 增加轻量事件订阅：`subscribeJobEvents(listener)` 和内部 `emitJobEvent(event)`。
- 新命中通知写入 state 后发出 `notification` 事件。
- 新热点报告写入 state 后发出 `hotspot` 事件。
- 前端连接 `/ws`，收到事件后插入侧边通知面板，并触发一次 `loadState()` 同步主列表。
- 前端 WebSocket 断开后延迟重连；原轮询仍保留作为兜底。

### UI 实现

- 顶部控制区使用三个模式按钮：热点雷达、监控词、搜索。
- 监控词模式显示单一输入框和开关列表。
- 搜索模式显示搜索输入框、搜索按钮和搜索结果。
- 右侧固定或浮动通知面板展示实时消息；移动端转为普通卡片流。
- 不引入图标库，使用文本和现有视觉语言保持轻量。

### 风险与降级

- 原生 WebSocket 实现仅需要服务端向浏览器推送文本事件，不处理复杂双向消息。
- 浏览器不支持 WebSocket 时，页面仍可通过 30 秒轮询刷新结果。
- 搜索依赖公开来源，部分来源失败时只展示错误摘要和可用结果。
