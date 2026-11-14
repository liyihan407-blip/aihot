# AIHot Java API

默认地址：`http://127.0.0.1:8787`。除健康检查外，启用 `API_TOKEN` 后都需要请求头 `X-AIHot-Token`。

## 检索

`POST /api/search`

```json
{"query":"Claude Code","sources":["bing","github","hackernews","bilibili"],"useAi":true}
```

`query` 为 1–160 字；`sources` 可选择 `google`、`bing`、`duckduckgo`、`hackernews`、`github`、`weixin`、`bilibili`、`weibo`。不传 `sources` 时使用 Bing、Hacker News、GitHub、哔哩哔哩。`useAi` 为 false 时使用规则匹配。

返回 `items`（结果）、`sources`（各来源状态及错误）、`expandedTerms`（匹配词）、`collected`、`analyzed`、`cached`、`filtered`、`deferred`、`mode` 和 `runId`。有任务执行时返回 409。模型降级结果的 `mode` 为 `degraded`，需要查看分析依据。

手动检索可选传入 `customAi` 对象，包含 `baseUrl`、`model` 和 `apiKey`；不传时使用服务器配置。接口地址须为允许域名的 HTTPS `/v1` 地址，额外可信域名通过 `AI_ALLOWED_HOSTS` 配置。密钥仅在请求期间使用，不回显到结果。监控词扫描和定时任务不会使用此对象。

## 热点与收藏

| 方法与路径 | 说明 |
|---|---|
| `GET /api/hotspots` | 分页查询；可传 `q`、`source`、`importance`、`keywordId`、`bookmarked`、`timeRange`、`sort`、`page`、`size` |
| `GET /api/hotspots/{id}` | 获取热点详情 |
| `PATCH /api/hotspots/{id}/bookmark` | 设置收藏，JSON：`{"bookmarked":true}` |
| `GET /api/stats` | 获取热点、关注和未读通知数量 |

`timeRange` 可选 `all`、`1h`、`24h`、`7d`、`30d`；`sort` 可选 `latest`、`published`、`heat`、`relevance`、`importance`。每页最多 50 条。

## 监控

| 方法与路径 | 说明 |
|---|---|
| `GET /api/keywords` | 获取监控词 |
| `POST /api/keywords` | 添加或更新：`{"term":"AI 编程","enabled":true,"intervalMinutes":30}` |
| `PATCH /api/keywords/{id}` | 更新启用状态或间隔，间隔为 5–1440 分钟 |
| `DELETE /api/keywords/{id}` | 删除监控词，保留已保存的热点 |
| `POST /api/keywords/{id}/scan` | 手动扫描此监控词 |

定时监控由 `SCHEDULER_ENABLED` 控制，当前为单实例设计。通知仅在监控任务中对首次关联、通过 AI 分析的新内容生成。

## 通知与运行情况

| 方法与路径 | 说明 |
|---|---|
| `GET /api/notifications?page=1&size=20` | 通知列表、总数和未读数 |
| `PATCH /api/notifications/{id}/read` | 标记一条已读；`id` 为 `all` 时全部标为已读 |
| `GET /api/sources` | 最近一次各来源状态 |
| `GET /api/runs` | 最近 30 次运行记录 |
| `GET /api/config` | 不含密钥的模型、来源和运行配置 |
| `GET /api/health` | 健康检查，不需要令牌 |

WebSocket 地址为 `/ws`，提供 `progress`、`notification`、`completed`、`failed` 和 `mail-error` 事件。启用访问令牌时，浏览器连接通过查询参数 `token` 验证；反向代理不应记录该参数。
