# Keyword API

关键词接口复用现有监控项存储。关闭关键词时只暂停扫描，关键词本身会继续保留；之后再次打开即可继续使用，不需要重新输入。

## Endpoints

### `GET /api/keywords`

读取已保存的关键词列表。

Response:

```json
{
  "keywords": [
    {
      "id": "mon_xxxxxx",
      "keyword": "Claude Code",
      "intervalMinutes": 30,
      "enabled": true,
      "status": "waiting",
      "nextRunAt": "2026-07-13T10:00:00.000Z"
    }
  ]
}
```

### `POST /api/keywords`

保存关键词。默认会打开关键词；如果同名关键词已存在，会更新原记录并重新打开，不会重复创建。

Request:

```json
{
  "keyword": "Claude Code",
  "intervalMinutes": 30,
  "enabled": true
}
```

`enabled` 可选。传 `false` 时只保存关键词，不立即启用扫描。

### `PATCH /api/keywords/:id`

更新关键词开关或扫描间隔。

Request:

```json
{
  "enabled": false
}
```

关闭后关键词仍会保留在本地 `data/state.json` 中。

### `DELETE /api/keywords/:id`

删除关键词记录。只有确认不再需要保留时使用。
