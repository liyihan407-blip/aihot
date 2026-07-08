# AIHot

AIHot 是一个轻量级 AI 热点与关键词监控工具。用户输入要监控的关键词或关注范围后，系统会定时从公开信息源抓取候选内容，并通过可切换 AI Provider 判断相关性、仿冒/钓鱼风险和热点强度；默认配置为 SiliconFlow + DeepSeek。

## 功能

- 关键词监控：输入关键词和扫描间隔，系统定时抓取公开信息源。
- AI 识别：通过 SiliconFlow/DeepSeek 或 OpenRouter 判断内容是否真正相关，过滤标题党、营销噪声、仿冒和钓鱼内容。
- 第一时间通知：页面内通知流 + 浏览器 Notification。
- 热点发现：输入范围，例如“AI 编程”，系统自动汇总热点报告。
- 响应式 Web 页面：桌面端是雷达式工作台，移动端自动压缩为单列。
- 本地数据：数据存储在 `data/state.json`，便于查看、备份或迁移。
- Agent Skill：网页版可用后，项目提供 `skills/aihot-monitor`，方便其他 AI 复用监控和热点发现流程。

## 快速开始

需要 Node.js 18 或更高版本。

```bash
npm start
```

打开：

```text
http://localhost:8787
```

## 环境变量

先复制模板：

```bash
copy .env.example .env
```

然后在 `.env` 中填写真实密钥。`.env` 不要提交到 Git。
服务启动时会自动读取项目根目录的 `.env`。

PowerShell 示例（SiliconFlow + DeepSeek）：

```powershell
$env:AI_PROVIDER="siliconflow"
$env:SILICONFLOW_API_KEY="你的 SiliconFlow Key"
$env:SILICONFLOW_MODEL="deepseek-ai/DeepSeek-V3.2"
npm start
```

如果当前 Provider 的 API Key 未配置，项目仍可运行，但会使用本地启发式规则回退；这只适合演示页面流程，不适合正式监控。

可选变量：

- `PORT`：服务端口，默认 `8787`
- `POLL_SECONDS`：后台调度器检查间隔，默认 `60`
- `AI_PROVIDER`：AI 服务商，支持 `siliconflow` 或 `openrouter`，默认 `siliconflow`
- `SILICONFLOW_API_KEY`：SiliconFlow API Key，准备接 DeepSeek 时填写这里
- `SILICONFLOW_MODEL`：SiliconFlow 模型，默认 `deepseek-ai/DeepSeek-V3.2`
- `OPENROUTER_API_KEY`：OpenRouter API Key，切换到 OpenRouter 时填写
- `OPENROUTER_MODEL`：OpenRouter 模型，默认 `openai/gpt-4.1-mini`
- `CONTEXT7_API_KEY`：开发时用于 Context7 MCP 文档查询
- `FIRECRAWL_API_KEY`：开发时用于扩展抓取工具

## 信息源

当前接入的公开源：

- Google News RSS
- Bing Search RSS
- DuckDuckGo HTML Search
- Hacker News Algolia
- GitHub Search
- Sogou Weixin Search
- Bilibili Web Search
- Weibo Public Search

部分网络环境可能无法访问 Google News、DuckDuckGo、搜狗微信、微博或 B 站公开入口，GitHub API 也可能遇到限流。AIHot 会把单个来源的错误展示在对应监控项里，不会因为单源失败而中断整个扫描。

仍需凭据或合规确认后再增强的源：

- Twitter：需要 API Key 和费用/权限确认
- 微博官方商业 API：需要确认付费、OAuth 和使用边界
- B 站开放平台：需要开发者身份认证、应用审核和平台授权

## API

- `GET /api/state`：读取完整状态。
- `POST /api/monitors`：新增关键词监控。
- `DELETE /api/monitors/:id`：删除关键词监控。
- `POST /api/scopes`：新增热点范围。
- `DELETE /api/scopes/:id`：删除热点范围。
- `POST /api/refresh`：立即扫描，body 示例：`{"target":"all"}`。

## 测试

```bash
npm test
```

测试覆盖：

- AI JSON 输出容错解析
- 本地回退判定
- 热点排序
- RSS 解析
- DuckDuckGo HTML 解析

## Agent Skill

`skills/aihot-monitor` 封装了 AIHot 的使用流程。其他 AI 可以读取该技能，按说明启动服务、配置 AI Provider、创建监控项、刷新扫描并解读结果。

## 项目文档

- [需求沉淀](docs/requirements.md)
- [技术方案](docs/technical-plan.md)
- [验证记录](docs/validation.md)
