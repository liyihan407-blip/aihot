const { extractJsonObject, normalizeText } = require("./utils");

const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_SILICONFLOW_MODEL = "deepseek-ai/DeepSeek-V3.2";

const PROVIDERS = {
  openrouter: {
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    defaultModel: DEFAULT_OPENROUTER_MODEL
  },
  siliconflow: {
    label: "SiliconFlow",
    endpoint: "https://api.siliconflow.cn/v1/chat/completions",
    keyEnv: "SILICONFLOW_API_KEY",
    modelEnv: "SILICONFLOW_MODEL",
    defaultModel: DEFAULT_SILICONFLOW_MODEL
  }
};

function isUsableKey(value) {
  const key = String(value || "").trim();
  if (!key) return false;
  return !/^(your_|YOUR_|<|填入|替换|example|demo|sk-xxx)/i.test(key);
}

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  return PROVIDERS[provider] ? provider : "siliconflow";
}

function getAiConfig() {
  const provider = normalizeProvider(process.env.AI_PROVIDER || "siliconflow");
  const meta = PROVIDERS[provider];
  const apiKey = String(process.env[meta.keyEnv] || "").trim();
  const model = process.env[meta.modelEnv] || meta.defaultModel;
  return {
    provider,
    providerLabel: meta.label,
    endpoint: meta.endpoint,
    apiKey,
    keyEnv: meta.keyEnv,
    model,
    configured: isUsableKey(apiKey)
  };
}

function heuristicMonitor(keyword, item) {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  const needle = String(keyword || "").toLowerCase();
  const relevant = needle && haystack.includes(needle);
  const suspiciousWords = ["fake", "scam", "spoof", "仿冒", "山寨", "钓鱼", "诈骗"];
  const impersonation = suspiciousWords.some((word) => haystack.includes(word));
  return {
    isRelevant: Boolean(relevant),
    isImpersonation: Boolean(impersonation),
    confidence: relevant ? 0.62 : 0.32,
    urgency: relevant && !impersonation ? 58 : 25,
    reason: "未配置可用 AI Provider Key，已使用本地启发式规则粗略判断。",
    notificationTitle: item.title,
    notificationBody: normalizeText(item.summary || item.url).slice(0, 180),
    tags: ["heuristic"],
    aiProvider: "local-fallback"
  };
}

function heuristicHotspots(scope, items) {
  const ranked = items
    .slice()
    .sort((a, b) => Number(b.scoreHint || 0) - Number(a.scoreHint || 0))
    .slice(0, 8);

  return {
    scope,
    summary: "未配置可用 AI Provider Key，已按来源热度和更新时间生成基础热点列表。",
    topics: ranked.map((item, index) => ({
      title: item.title,
      heat: Math.max(35, 86 - index * 6),
      why: `${item.source} 出现相关内容。`,
      sourceIds: [item.id],
      risk: "unknown"
    })),
    aiProvider: "local-fallback"
  };
}

function providerHeaders(config) {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${config.apiKey}`
  };
  if (config.provider === "openrouter") {
    headers["http-referer"] = "http://localhost:8787";
    headers["x-title"] = "AIHot";
  }
  return headers;
}

function requestBody(config, messages, schemaHint) {
  const body = {
    model: config.model,
    temperature: 0.2,
    stream: false,
    messages: [
      {
        role: "system",
        content: `你是热点监控和内容真实性识别助手。只输出 JSON，不要 Markdown。${schemaHint}`
      },
      ...messages
    ]
  };
  if (config.provider === "openrouter") {
    body.response_format = { type: "json_object" };
    body.provider = { require_parameters: true };
  } else if (config.provider === "siliconflow") {
    body.response_format = { type: "text" };
    body.enable_thinking = false;
  }
  return body;
}

async function callAiJson(messages, schemaHint) {
  const config = getAiConfig();
  if (!config.configured) return null;

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: providerHeaders(config),
    body: JSON.stringify(requestBody(config, messages, schemaHint))
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${config.providerLabel} ${response.status}: ${text.slice(0, 240)}`);
  }

  const data = await response.json();
  const choice = data.choices && data.choices[0];
  if (choice && choice.error) {
    throw new Error(`${config.providerLabel} choice error: ${choice.error.message || JSON.stringify(choice.error)}`);
  }
  const content = choice && choice.message ? choice.message.content : "";
  const parsed = extractJsonObject(content);
  if (!parsed) throw new Error(`${config.providerLabel} returned non-JSON content.`);
  return { ...parsed, aiProvider: config.provider, model: config.model };
}

async function evaluateMonitorItem(keyword, item) {
  const config = getAiConfig();
  const schema = "Schema: {\"isRelevant\":boolean,\"isImpersonation\":boolean,\"confidence\":number,\"urgency\":number,\"reason\":string,\"notificationTitle\":string,\"notificationBody\":string,\"tags\":string[]}";
  const result = await callAiJson([
    {
      role: "user",
      content: JSON.stringify({
        task: "判断该内容是否真正与用户监控关键词相关，并识别标题党、钓鱼、仿冒、营销噪声或明显不可信内容。只有确实相关且非假冒时才应该触发通知。",
        keyword,
        item
      })
    }
  ], schema).catch((error) => ({
    ...heuristicMonitor(keyword, item),
    aiProvider: `${config.provider}-error`,
    reason: `${config.providerLabel} 调用失败，已回退到本地规则：${error.message}`
  }));

  return result || heuristicMonitor(keyword, item);
}

async function summarizeHotspots(scope, items) {
  const config = getAiConfig();
  const compactItems = items.slice(0, 18).map((item) => ({
    id: item.id,
    source: item.source,
    title: item.title,
    summary: item.summary,
    url: item.url,
    publishedAt: item.publishedAt,
    scoreHint: item.scoreHint
  }));
  const schema = "Schema: {\"scope\":string,\"summary\":string,\"topics\":[{\"title\":string,\"heat\":number,\"why\":string,\"sourceIds\":string[],\"risk\":\"low|medium|high|unknown\"}]}";
  const result = await callAiJson([
    {
      role: "user",
      content: JSON.stringify({
        task: "从候选内容中识别指定范围内的真实热点。合并重复事件，降低广告、仿冒、低可信来源权重，按热度排序。",
        scope,
        items: compactItems
      })
    }
  ], schema).catch((error) => ({
    ...heuristicHotspots(scope, items),
    aiProvider: `${config.provider}-error`,
    summary: `${config.providerLabel} 调用失败，已回退到本地排序：${error.message}`
  }));

  return result || heuristicHotspots(scope, items);
}

module.exports = {
  callAiJson,
  evaluateMonitorItem,
  getAiConfig,
  heuristicHotspots,
  heuristicMonitor,
  isUsableKey,
  summarizeHotspots
};
