const test = require("node:test");
const assert = require("node:assert/strict");
const { extractJsonObject } = require("../src/utils");
const { getAiConfig, heuristicMonitor, heuristicHotspots, isUsableKey } = require("../src/ai");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadEnv } = require("../src/env");
const {
  parseBilibiliItems,
  parseDuckDuckGoItems,
  parseRssItems,
  parseSogouWeixinItems,
  parseWeiboItems
} = require("../src/sources");

test("loadEnv reads dotenv files without overriding existing values", () => {
  const file = path.join(os.tmpdir(), `aihot-${Date.now()}.env`);
  fs.writeFileSync(file, "AIHOT_TEST_KEY=from_file\nAIHOT_KEEP=from_file\nQUOTED_VALUE=\"hello world\"\n", "utf8");
  process.env.AIHOT_KEEP = "from_process";
  delete process.env.AIHOT_TEST_KEY;
  delete process.env.QUOTED_VALUE;

  const result = loadEnv(file);

  assert.equal(result.loaded, true);
  assert.equal(process.env.AIHOT_TEST_KEY, "from_file");
  assert.equal(process.env.AIHOT_KEEP, "from_process");
  assert.equal(process.env.QUOTED_VALUE, "hello world");

  delete process.env.AIHOT_TEST_KEY;
  delete process.env.AIHOT_KEEP;
  delete process.env.QUOTED_VALUE;
  fs.unlinkSync(file);
});

test("AI provider defaults to SiliconFlow and ignores placeholder keys", () => {
  const originalProvider = process.env.AI_PROVIDER;
  const originalSiliconFlowKey = process.env.SILICONFLOW_API_KEY;
  const originalSiliconFlowModel = process.env.SILICONFLOW_MODEL;

  delete process.env.AI_PROVIDER;
  process.env.SILICONFLOW_API_KEY = "your_siliconflow_api_key_here";
  delete process.env.SILICONFLOW_MODEL;

  const config = getAiConfig();

  assert.equal(config.provider, "siliconflow");
  assert.equal(config.providerLabel, "SiliconFlow");
  assert.equal(config.keyEnv, "SILICONFLOW_API_KEY");
  assert.equal(config.model, "deepseek-ai/DeepSeek-V3.2");
  assert.equal(config.configured, false);
  assert.equal(isUsableKey("sk-real-looking-value"), true);
  assert.equal(isUsableKey("your_openrouter_api_key_here"), false);

  if (originalProvider === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = originalProvider;
  if (originalSiliconFlowKey === undefined) delete process.env.SILICONFLOW_API_KEY;
  else process.env.SILICONFLOW_API_KEY = originalSiliconFlowKey;
  if (originalSiliconFlowModel === undefined) delete process.env.SILICONFLOW_MODEL;
  else process.env.SILICONFLOW_MODEL = originalSiliconFlowModel;
});

test("AI provider can switch to OpenRouter", () => {
  const originalProvider = process.env.AI_PROVIDER;
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;

  process.env.AI_PROVIDER = "openrouter";
  process.env.OPENROUTER_API_KEY = "sk-real-looking-value";
  process.env.OPENROUTER_MODEL = "openai/gpt-4.1-mini";

  const config = getAiConfig();

  assert.equal(config.provider, "openrouter");
  assert.equal(config.providerLabel, "OpenRouter");
  assert.equal(config.keyEnv, "OPENROUTER_API_KEY");
  assert.equal(config.model, "openai/gpt-4.1-mini");
  assert.equal(config.configured, true);

  if (originalProvider === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = originalProvider;
  if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
  if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
});

test("extractJsonObject tolerates wrapped model output", () => {
  const parsed = extractJsonObject("结果如下：{\"ok\":true,\"score\":7}");
  assert.deepEqual(parsed, { ok: true, score: 7 });
});

test("heuristicMonitor marks keyword matches as relevant", () => {
  const verdict = heuristicMonitor("AI 编程", {
    title: "AI 编程工具发布新版本",
    summary: "支持自动修复代码"
  });
  assert.equal(verdict.isRelevant, true);
  assert.equal(verdict.isImpersonation, false);
  assert.ok(verdict.confidence >= 0.55);
});

test("heuristicHotspots returns ranked topics", () => {
  const result = heuristicHotspots("AI 编程", [
    { id: "a", title: "低热度", source: "x", scoreHint: 1 },
    { id: "b", title: "高热度", source: "x", scoreHint: 100 }
  ]);
  assert.equal(result.topics[0].title, "高热度");
});

test("parseRssItems extracts item fields", () => {
  const items = parseRssItems(`
    <rss><channel><item>
      <title><![CDATA[AI Hot News]]></title>
      <link>https://example.com/a</link>
      <description><![CDATA[Useful summary]]></description>
      <pubDate>Tue, 07 Jul 2026 00:00:00 GMT</pubDate>
    </item></channel></rss>
  `, "Test");
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "AI Hot News");
  assert.equal(items[0].url, "https://example.com/a");
});

test("parseDuckDuckGoItems extracts result fields and decodes redirect URLs", () => {
  const items = parseDuckDuckGoItems(`
    <div class="result results_links">
      <div class="links_main">
        <a class="result__a" href="/l/?kh=-1&amp;uddg=https%3A%2F%2Fexample.com%2Fai">AI Search Result</a>
        <a class="result__snippet" href="/l/?kh=-1&amp;uddg=https%3A%2F%2Fexample.com%2Fai">Useful summary about AI tools.</a>
      </div>
    </div>
  `);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "DuckDuckGo");
  assert.equal(items[0].title, "AI Search Result");
  assert.equal(items[0].url, "https://example.com/ai");
  assert.equal(items[0].summary, "Useful summary about AI tools.");
});

test("parseSogouWeixinItems extracts article fields", () => {
  const items = parseSogouWeixinItems(`
    <div class="txt-box">
      <h3><a target="_blank" href="/link?url=abc">AI 编程新趋势</a></h3>
      <p class="txt-info">这是一篇关于 AI 编程的公众号文章。</p>
      <a class="account">科技观察</a>
      <span class="s2">2026-07-08</span>
    </div>
  `);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "Sogou Weixin");
  assert.equal(items[0].title, "AI 编程新趋势");
  assert.equal(items[0].url, "https://weixin.sogou.com/link?url=abc");
  assert.match(items[0].summary, /科技观察/);
});

test("parseBilibiliItems extracts video fields", () => {
  const items = parseBilibiliItems({
    data: {
      result: [{
        bvid: "BV123",
        title: "AI <em class=\"keyword\">编程</em> 实战",
        arcurl: "//www.bilibili.com/video/BV123",
        description: "演示智能代码工具",
        author: "开发者频道",
        tag: "AI,编程",
        pubdate: 1783470000,
        play: "1.5万"
      }]
    }
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "Bilibili");
  assert.equal(items[0].title, "AI 编程 实战");
  assert.equal(items[0].url, "https://www.bilibili.com/video/BV123");
  assert.equal(items[0].scoreHint, 15000);
});

test("parseWeiboItems extracts public search cards", () => {
  const items = parseWeiboItems(`
    <div class="card-wrap">
      <p class="txt" node-type="feed_list_content">AI 编程工具在开发者圈热议</p>
      <a class="name" href="//weibo.com/u/123">科技博主</a>
      <p class="from"><a href="//weibo.com/123/abc">7月8日 10:00</a></p>
    </div>
  `);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "Weibo");
  assert.equal(items[0].title, "AI 编程工具在开发者圈热议");
  assert.equal(items[0].url, "https://weibo.com/u/123");
  assert.match(items[0].summary, /科技博主/);
});
