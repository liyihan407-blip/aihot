const { hashText, htmlDecode, normalizeText, stripCdata } = require("./utils");

const USER_AGENT = "aihot/0.1 (+https://local.aihot)";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const SOURCE_NAMES = [
  "Google News",
  "Bing",
  "DuckDuckGo",
  "Hacker News",
  "GitHub",
  "Sogou Weixin",
  "Bilibili",
  "Weibo"
];

async function fetchText(url, timeoutMs = 12000, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, ...headers }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = 12000, headers = {}) {
  const text = await fetchText(url, timeoutMs, headers);
  return JSON.parse(text);
}

function readTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? normalizeText(htmlDecode(stripCdata(match[1]))) : "";
}

function parseRssItems(xml, sourceName) {
  const blocks = String(xml || "").match(/<item[\s\S]*?<\/item>/gi) || [];
  return blocks.slice(0, 12).map((block) => {
    const title = readTag(block, "title");
    const url = readTag(block, "link");
    const summary = readTag(block, "description");
    const publishedAt = readTag(block, "pubDate");
    return {
      id: hashText(`${sourceName}:${url || title}`),
      source: sourceName,
      title,
      url,
      summary,
      publishedAt,
      scoreHint: 35
    };
  }).filter((item) => item.title && item.url);
}

async function searchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  const xml = await fetchText(url);
  return parseRssItems(xml, "Google News");
}

async function searchBing(query) {
  const url = `https://cn.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
  const xml = await fetchText(url, 12000, { "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" });
  const items = parseRssItems(xml, "Bing");
  if (!items.length) throw new Error("No RSS items parsed from Bing response.");
  return items;
}

async function searchHackerNews(query) {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=8`;
  const data = await fetchJson(url);
  return (data.hits || []).map((hit) => ({
    id: hashText(`hn:${hit.objectID}`),
    source: "Hacker News",
    title: normalizeText(hit.title || hit.story_title),
    url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    summary: normalizeText(hit.story_text || hit.comment_text || ""),
    publishedAt: hit.created_at,
    scoreHint: Number(hit.points || 0)
  })).filter((item) => item.title && item.url);
}

async function searchGitHub(query) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=8`;
  const data = await fetchJson(url);
  return (data.items || []).map((repo) => ({
    id: hashText(`github:${repo.full_name}`),
    source: "GitHub",
    title: repo.full_name,
    url: repo.html_url,
    summary: normalizeText(repo.description || ""),
    publishedAt: repo.updated_at,
    scoreHint: Number(repo.stargazers_count || 0)
  }));
}

function readAttribute(value, name) {
  const match = String(value || "").match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? htmlDecode(match[1]) : "";
}

function cleanHtmlText(value) {
  return normalizeText(htmlDecode(String(value || "").replace(/<[^>]*>/g, " ")));
}

function absoluteUrl(value, base) {
  const raw = htmlDecode(value || "");
  try {
    if (raw.startsWith("//")) return `https:${raw}`;
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}

function parseMetric(value) {
  const raw = String(value || "").replace(/,/g, "").trim();
  const match = raw.match(/([\d.]+)\s*([万亿]?)/);
  if (!match) return 0;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return 0;
  if (match[2] === "亿") return Math.round(number * 100000000);
  if (match[2] === "万") return Math.round(number * 10000);
  return Math.round(number);
}

function decodeDuckDuckGoUrl(value) {
  const raw = htmlDecode(value || "");
  try {
    const url = raw.startsWith("//") ? new URL(`https:${raw}`) : new URL(raw, "https://duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : url.href;
  } catch {
    return raw;
  }
}

function parseDuckDuckGoItems(html) {
  const blocks = String(html || "").match(/<div[^>]+class=["'][^"']*result[^"']*["'][\s\S]*?<\/div>\s*<\/div>/gi) || [];
  return blocks.slice(0, 12).map((block) => {
    const titleMatch = block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*>[\s\S]*?<\/a>/i);
    if (!titleMatch) return null;
    const titleAnchor = titleMatch[0];
    const href = readAttribute(titleAnchor, "href");
    const snippetMatch = block.match(/<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>[\s\S]*?<\/a>/i)
      || block.match(/<div[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>[\s\S]*?<\/div>/i);
    const title = cleanHtmlText(titleAnchor);
    const url = decodeDuckDuckGoUrl(href);
    return {
      id: hashText(`duckduckgo:${url || title}`),
      source: "DuckDuckGo",
      title,
      url,
      summary: snippetMatch ? cleanHtmlText(snippetMatch[0]) : "",
      publishedAt: "",
      scoreHint: 30
    };
  }).filter((item) => item && item.title && item.url);
}

async function searchDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url, 12000, {
    accept: "text/html,application/xhtml+xml",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
  });
  return parseDuckDuckGoItems(html);
}

function parseSogouWeixinItems(html) {
  const blocks = String(html || "").match(/<div[^>]+class=["'][^"']*txt-box[^"']*["'][\s\S]*?<\/div>/gi) || [];
  return blocks.slice(0, 12).map((block) => {
    const titleMatch = block.match(/<h3[^>]*>\s*<a[^>]+>[\s\S]*?<\/a>\s*<\/h3>/i)
      || block.match(/<a[^>]+target=["']_blank["'][^>]*>[\s\S]*?<\/a>/i);
    if (!titleMatch) return null;
    const anchor = titleMatch[0];
    const href = readAttribute(anchor, "href");
    const summaryMatch = block.match(/<p[^>]+class=["'][^"']*txt-info[^"']*["'][^>]*>[\s\S]*?<\/p>/i)
      || block.match(/<p[^>]+class=["'][^"']*txt-info[^"']*["'][^>]*>[\s\S]*?<\/p>/i);
    const accountMatch = block.match(/<a[^>]+class=["'][^"']*account[^"']*["'][^>]*>[\s\S]*?<\/a>/i);
    const timeMatch = block.match(/timeConvert\(['"]?(\d+)['"]?\)/i)
      || block.match(/<span[^>]+class=["'][^"']*s2[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const title = cleanHtmlText(anchor);
    const account = accountMatch ? cleanHtmlText(accountMatch[0]) : "";
    const summary = [
      summaryMatch ? cleanHtmlText(summaryMatch[0]) : "",
      account ? `公众号：${account}` : ""
    ].filter(Boolean).join(" ");
    return {
      id: hashText(`sogou-weixin:${href || title}`),
      source: "Sogou Weixin",
      title,
      url: absoluteUrl(href, "https://weixin.sogou.com/"),
      summary,
      publishedAt: timeMatch ? String(timeMatch[1] || "") : "",
      scoreHint: 40
    };
  }).filter((item) => item && item.title && item.url);
}

async function searchSogouWeixin(query) {
  const url = `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(query)}`;
  const html = await fetchText(url, 12000, {
    accept: "text/html,application/xhtml+xml",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    referer: "https://weixin.sogou.com/"
  });
  return parseSogouWeixinItems(html);
}

function parseBilibiliItems(payload) {
  const result = payload && payload.data && Array.isArray(payload.data.result)
    ? payload.data.result
    : [];
  return result.slice(0, 12).map((video) => {
    const bvid = video.bvid || video.id || "";
    const rawUrl = video.arcurl || video.url || (bvid ? `https://www.bilibili.com/video/${bvid}` : "");
    const title = cleanHtmlText(video.title || video.name || "");
    const author = cleanHtmlText(video.author || video.upic || "");
    const description = cleanHtmlText(video.description || video.desc || "");
    const tags = cleanHtmlText(video.tag || "");
    const pubdate = Number(video.pubdate || video.senddate || 0);
    const play = parseMetric(video.play || video.video_review || video.review || video.hit_columns);
    return {
      id: hashText(`bilibili:${bvid || rawUrl || title}`),
      source: "Bilibili",
      title,
      url: absoluteUrl(rawUrl, "https://www.bilibili.com/"),
      summary: [
        description,
        author ? `UP：${author}` : "",
        tags ? `标签：${tags}` : ""
      ].filter(Boolean).join(" "),
      publishedAt: pubdate ? new Date(pubdate * 1000).toISOString() : "",
      scoreHint: play || Number(video.rank_score || 0) || 45
    };
  }).filter((item) => item.title && item.url);
}

async function searchBilibili(query) {
  const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(query)}&page=1`;
  const data = await fetchJson(url, 12000, {
    accept: "application/json,text/plain,*/*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    referer: "https://search.bilibili.com/",
    "user-agent": BROWSER_USER_AGENT
  });
  return parseBilibiliItems(data);
}

function parseWeiboItems(html) {
  const blocks = String(html || "").match(/<div[^>]+class=["'][^"']*card-wrap[^"']*["'][\s\S]*?(?=<div[^>]+class=["'][^"']*card-wrap[^"']*["']|$)/gi) || [];
  return blocks.slice(0, 12).map((block) => {
    const textMatch = block.match(/<p[^>]+class=["'][^"']*txt[^"']*["'][^>]*>[\s\S]*?<\/p>/i);
    const linkMatch = block.match(/<a[^>]+href=["']([^"']*(?:weibo\.com|\/weibo)[^"']*)["'][^>]*>/i)
      || block.match(/<a[^>]+href=["']([^"']+)["'][^>]*action-type=["']feed_list_url["'][^>]*>/i);
    const title = cleanHtmlText(textMatch ? textMatch[0] : block)
      .replace(/\s*(赞|转发|评论)\s*\d*\s*$/g, "")
      .slice(0, 120);
    const href = linkMatch ? linkMatch[1] : "";
    const nickMatch = block.match(/<a[^>]+class=["'][^"']*name[^"']*["'][^>]*>[\s\S]*?<\/a>/i);
    const timeMatch = block.match(/<p[^>]+class=["'][^"']*from[^"']*["'][^>]*>[\s\S]*?<\/p>/i);
    const summary = [
      nickMatch ? `作者：${cleanHtmlText(nickMatch[0])}` : "",
      timeMatch ? cleanHtmlText(timeMatch[0]) : ""
    ].filter(Boolean).join(" ");
    return {
      id: hashText(`weibo:${href || title}`),
      source: "Weibo",
      title,
      url: href ? absoluteUrl(href, "https://s.weibo.com/") : `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`,
      summary,
      publishedAt: "",
      scoreHint: 50
    };
  }).filter((item) => item.title && item.url);
}

async function searchWeibo(query) {
  const url = `https://s.weibo.com/weibo?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url, 12000, {
    accept: "text/html,application/xhtml+xml",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    referer: "https://s.weibo.com/"
  });
  if (/Sina Visitor System|passport\.weibo\.com\/visitor/i.test(html)) {
    throw new Error("Weibo visitor verification required.");
  }
  return parseWeiboItems(html);
}

async function collectSources(query) {
  const sourceJobs = [
    { name: "Google News", task: searchGoogleNews(query) },
    { name: "Bing", task: searchBing(query) },
    { name: "DuckDuckGo", task: searchDuckDuckGo(query) },
    { name: "Hacker News", task: searchHackerNews(query) },
    { name: "GitHub", task: searchGitHub(query) },
    { name: "Sogou Weixin", task: searchSogouWeixin(query) },
    { name: "Bilibili", task: searchBilibili(query) },
    { name: "Weibo", task: searchWeibo(query) }
  ];

  const settled = await Promise.allSettled(sourceJobs.map((source) => source.task));
  const items = [];
  const errors = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      errors.push({
        source: sourceJobs[index].name,
        message: result.reason && result.reason.message ? result.reason.message : String(result.reason)
      });
    }
  });

  const unique = new Map();
  items.forEach((item) => {
    if (!unique.has(item.id)) unique.set(item.id, item);
  });

  return {
    items: Array.from(unique.values()).slice(0, 40),
    errors
  };
}

module.exports = {
  collectSources,
  parseBilibiliItems,
  parseDuckDuckGoItems,
  parseRssItems,
  parseSogouWeixinItems,
  parseWeiboItems,
  SOURCE_NAMES
};
