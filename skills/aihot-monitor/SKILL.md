---
name: aihot-monitor
description: Run and operate the AIHot project for AI-powered keyword monitoring and hotspot discovery. Use when Codex needs to start AIHot, configure SiliconFlow/DeepSeek or OpenRouter, create keyword monitors, create hotspot scopes, trigger scans, inspect notifications/hot topics, or explain how another AI should reuse this repository as a monitoring tool.
---

# AIHot Monitor

## Overview

Use AIHot as a local Web tool and API for two jobs: monitor user-entered keywords for real, non-impersonation signals; and periodically discover hotspots inside a user-defined scope.

Prefer the Web flow first. Use the API when automating, testing, or when another AI needs a repeatable workflow.

## Workflow

1. Confirm the repository root contains `package.json` and `server.js`.
2. Check environment setup:
   - Use `.env.example` to identify required variables.
   - Real secrets belong in `.env` or local shell variables, never in committed files.
   - `AI_PROVIDER=siliconflow` with `SILICONFLOW_API_KEY` enables the default SiliconFlow/DeepSeek AI judgement path; `AI_PROVIDER=openrouter` with `OPENROUTER_API_KEY` is also supported.
   - Without a usable key for the selected provider, AIHot uses local heuristic fallback.
3. Start the Web app:
   - Run `npm start`.
   - Open `http://localhost:8787`.
4. Create monitors:
   - Add keyword monitors for concrete names, brands, products, or events.
   - Choose a practical interval. Use 30 minutes for normal monitoring; use shorter intervals only for urgent watch tasks.
5. Create hotspot scopes:
   - Add broader domains such as `AI 编程`, `机器人`, or `出海 SaaS`.
   - Use 60 minutes or longer for hotspot discovery unless the user needs near-real-time scanning.
6. Trigger a scan:
   - Use the Web button `立即扫描`, or call `POST /api/refresh`.
7. Review output:
   - Treat notifications as actionable only when AI verdict says `isRelevant=true`, `isImpersonation=false`, and confidence passes the app threshold.
   - Treat source errors as partial-failure diagnostics; one source failing does not invalidate other results.
8. Run tests before handing off changes:
   - `npm test`.

## API Usage

Read `references/api.md` when you need exact endpoint shapes, state fields, or curl examples.

Common calls:

```bash
curl http://localhost:8787/api/state
curl -X POST http://localhost:8787/api/monitors -H "content-type: application/json" -d "{\"keyword\":\"Claude Code\",\"intervalMinutes\":30}"
curl -X POST http://localhost:8787/api/scopes -H "content-type: application/json" -d "{\"scope\":\"AI 编程\",\"intervalMinutes\":60}"
curl -X POST http://localhost:8787/api/refresh -H "content-type: application/json" -d "{\"target\":\"all\"}"
```

## Operating Notes

- Current sources: Google News RSS, Bing Search RSS, DuckDuckGo HTML Search, Hacker News Algolia, GitHub Search, Sogou Weixin Search, Bilibili Web Search, Weibo Public Search.
- Some environments cannot reach Google News, DuckDuckGo, Sogou Weixin, Bilibili, or Weibo public endpoints. Keep the partial-success behavior and surface source errors to the user.
- SiliconFlow + DeepSeek is the default production AI path. OpenRouter remains supported as an alternate provider. Local fallback is useful for demos but not enough for high-confidence monitoring.
- Do not add Twitter, authenticated Weibo APIs, authenticated Bilibili Open Platform APIs, login-state scraping, or captcha handling without confirming API access, platform rules, rate limits, and credentials.
- Keep changes lightweight. AIHot is intentionally a small tool project with minimal dependencies.
