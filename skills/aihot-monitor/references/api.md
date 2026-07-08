# AIHot API Reference

## State

`GET /api/state`

Returns the full app state plus runtime config:

```json
{
  "monitors": [],
  "scopes": [],
  "notifications": [],
  "hotTopics": [],
  "seen": {},
  "config": {
    "aiProvider": "siliconflow",
    "aiProviderLabel": "SiliconFlow",
    "hasAiKey": true,
    "hasOpenRouterKey": false,
    "model": "deepseek-ai/DeepSeek-V3.2",
    "sources": ["Google News", "Bing", "DuckDuckGo", "Hacker News", "GitHub", "Sogou Weixin", "Bilibili", "Weibo"]
  }
}
```

## Keyword Monitoring

`POST /api/monitors`

Request:

```json
{
  "keyword": "Claude Code",
  "intervalMinutes": 30
}
```

`DELETE /api/monitors/:id`

Deletes a monitor.

## Hotspot Scopes

`POST /api/scopes`

Request:

```json
{
  "scope": "AI 编程",
  "intervalMinutes": 60
}
```

`DELETE /api/scopes/:id`

Deletes a scope and its related hotspot reports.

## Refresh

`POST /api/refresh`

Request:

```json
{
  "target": "all"
}
```

`target` can be:

- `all`
- `monitors`
- `scopes`

Response contains a `report` and the updated `state`.

## Notification Semantics

A notification means:

- A source item was collected.
- AIHot evaluated the item against a monitor keyword.
- The verdict passed relevance and impersonation checks.
- The item was not previously seen for that monitor.

Important verdict fields:

- `isRelevant`: whether the item is actually related to the keyword.
- `isImpersonation`: whether the item looks like phishing, spoofing, scam, or impersonation.
- `confidence`: numeric confidence from AI or fallback.
- `urgency`: numeric priority for UI display.
- `reason`: explanation shown to the user.

## Hot Topic Semantics

A hotspot report belongs to one scope and includes:

- `summary`: short AI-generated overview.
- `topics[]`: ranked topic list.
- `heat`: numeric heat score.
- `risk`: `low`, `medium`, `high`, or `unknown`.
- `sources`: source items supporting the topic.
