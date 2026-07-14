const state = {
  data: null,
  knownNotices: new Set(),
  searchResults: null,
  realtimeEvents: [],
  mode: "radar",
  ws: null,
  filters: {
    source: "all",
    importance: "all",
    keyword: "all",
    timeRange: "all",
    sortBy: "importance"
  }
};

const $ = (selector) => document.querySelector(selector);

function toast(message) {
  $("#toast").textContent = message;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    $("#toast").textContent = "";
  }, 4200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function setButtonBusy(button, isBusy, busyHtml = "处理中") {
  if (!button) return;
  if (isBusy) {
    button.dataset.idleHtml = button.dataset.idleHtml || button.innerHTML;
    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    button.innerHTML = busyHtml;
    return;
  }
  button.disabled = false;
  button.classList.remove("is-loading");
  button.removeAttribute("aria-busy");
  if (button.dataset.idleHtml) button.innerHTML = button.dataset.idleHtml;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function relativeTime(value) {
  if (!value) return "暂停中";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "时间未知";
  const diff = Date.now() - time;
  const minutes = Math.round(Math.abs(diff) / 60000);
  const suffix = diff >= 0 ? "前" : "后";
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟${suffix}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时${suffix}`;
  return new Date(value).toLocaleString("zh-CN");
}

function absoluteTime(value) {
  if (!value) return "未知";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return String(value);
  return new Date(value).toLocaleString("zh-CN");
}

function shortText(value, maxLength = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function confidencePercent(value) {
  const number = Number(value || 0);
  const normalized = number > 1 ? number : number * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function clampScore(value) {
  const number = Number(value || 0);
  return Math.max(0, Math.min(100, Math.round(number)));
}

function timeValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function importanceLevel(score) {
  const value = clampScore(score);
  if (value >= 80) return "urgent";
  if (value >= 60) return "high";
  if (value >= 40) return "medium";
  return "low";
}

function sourceLabel(value) {
  if (value === "Bilibili") return "B 站";
  if (value === "Sogou Weixin") return "搜狗微信";
  return value || "未知来源";
}

function detailRow(label, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `<div class="detail-row"><span>${escapeHtml(label)}</span><p>${escapeHtml(text)}</p></div>`;
}

function renderMetric(label, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(text)}</strong></div>`;
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
  document.querySelectorAll(".mode-pane").forEach((pane) => {
    pane.classList.toggle("is-active", pane.dataset.pane === mode);
  });
  const searchPanel = $("#searchResultsPanel");
  if (searchPanel) searchPanel.hidden = mode !== "search";
}

function timeRangeStart(range) {
  const map = {
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000
  };
  return map[range] ? Date.now() - map[range] : 0;
}

function noticeScores(notice) {
  const verdict = notice.verdict || {};
  const item = notice.item || {};
  return {
    importance: clampScore(verdict.urgency),
    heat: clampScore(verdict.urgency || item.scoreHint),
    relevance: confidencePercent(verdict.confidence),
    published: timeValue(item.publishedAt),
    discovered: timeValue(notice.createdAt)
  };
}

function noticeHeat(notice) {
  const verdict = notice.verdict || {};
  const item = notice.item || {};
  return clampScore(item.scoreHint || verdict.urgency);
}

function topicSources(topic) {
  return Array.isArray(topic.sources) ? topic.sources : [];
}

function topicMentionsSource(topic, source) {
  const sources = topicSources(topic);
  if (sources.some((item) => item.source === source)) return true;
  const haystack = `${topic.why || ""} ${topic.reason || ""} ${topic.title || ""}`;
  return matchesText(haystack, source) || matchesText(haystack, sourceLabel(source));
}

function topicScores(report, topic) {
  const sources = topicSources(topic);
  const latestPublished = sources.reduce((latest, source) => Math.max(latest, timeValue(source.publishedAt)), 0);
  const heat = clampScore(topic.heat);
  return {
    importance: heat,
    heat,
    relevance: heat,
    published: latestPublished,
    discovered: timeValue(report.createdAt)
  };
}

function latestPublishedAt(sources) {
  const latest = (sources || []).reduce((value, source) => {
    const time = timeValue(source.publishedAt);
    return time > value ? time : value;
  }, 0);
  return latest ? new Date(latest).toISOString() : "";
}

function sourceNamesFromTopic(topic) {
  const names = topicSources(topic).map((source) => source.source).filter(Boolean);
  return Array.from(new Set(names)).map(sourceLabel).join(" / ");
}

function compareBySort(a, b, sortBy) {
  const primary = (b.scores[sortBy] || 0) - (a.scores[sortBy] || 0);
  if (primary) return primary;
  return (b.scores.discovered || 0) - (a.scores.discovered || 0);
}

function matchesTime(createdAt) {
  const start = timeRangeStart(state.filters.timeRange);
  return !start || timeValue(createdAt) >= start;
}

function matchesText(value, keyword) {
  return String(value || "").toLowerCase().includes(String(keyword || "").toLowerCase());
}

function filterAndSortNotifications(notifications) {
  const { source, importance, keyword, sortBy } = state.filters;
  return (notifications || [])
    .map((notice) => ({ notice, scores: noticeScores(notice) }))
    .filter(({ notice, scores }) => {
      const item = notice.item || {};
      if (source !== "all" && item.source !== source) return false;
      if (importance !== "all" && importanceLevel(scores.importance) !== importance) return false;
      if (keyword !== "all" && notice.keyword !== keyword) return false;
      return matchesTime(notice.createdAt);
    })
    .sort((a, b) => compareBySort(a, b, sortBy))
    .map(({ notice }) => notice);
}

function filterAndSortHotTopics(hotTopics) {
  const { source, importance, keyword, sortBy } = state.filters;
  return (hotTopics || [])
    .map((report) => {
      const topics = (report.topics || report.analysis?.topics || [])
        .map((topic) => ({ topic, scores: topicScores(report, topic) }))
        .filter(({ topic, scores }) => {
          if (source !== "all" && !topicMentionsSource(topic, source)) return false;
          if (importance !== "all" && importanceLevel(scores.importance) !== importance) return false;
          if (keyword !== "all") {
            const haystack = `${report.scope || ""} ${topic.title || ""} ${topic.why || topic.reason || ""}`;
            if (!matchesText(haystack, keyword)) return false;
          }
          return matchesTime(report.createdAt);
        })
        .sort((a, b) => compareBySort(a, b, sortBy))
        .map(({ topic }) => topic);

      return { ...report, topics };
    })
    .filter((report) => report.topics.length)
    .sort((a, b) => {
      const aTop = topicScores(a, a.topics[0]);
      const bTop = topicScores(b, b.topics[0]);
      return compareBySort({ scores: aTop }, { scores: bTop }, sortBy);
    });
}

function normalizeError(error) {
  if (!error) return "";
  if (Array.isArray(error)) {
    return error.map((item) => item.message || item.error || String(item)).join("; ");
  }
  return String(error);
}

function statusLabel(status, enabled = true) {
  if (!enabled) return "已暂停";
  const map = {
    ok: "已就绪",
    waiting: "等待扫描",
    running: "扫描中",
    error: "异常",
    idle: "空闲"
  };
  return map[status] || status || "等待扫描";
}

function renderSources(sources) {
  $("#sourceList").innerHTML = (sources || [])
    .map((source) => `<span class="source-chip">${escapeHtml(sourceLabel(source))}</span>`)
    .join("");
}

function setSelectOptions(select, options, placeholder) {
  if (!select) return;
  const current = select.value || "all";
  select.innerHTML = [
    `<option value="all">${escapeHtml(placeholder)}</option>`,
    ...options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
  ].join("");
  select.value = options.some((option) => option.value === current) ? current : "all";
}

function renderFilterOptions(data) {
  const configuredSources = data.config?.sources || [];
  const noticeSources = (data.notifications || []).map((notice) => notice.item?.source).filter(Boolean);
  const topicSourcesList = (data.hotTopics || []).flatMap((report) => {
    const topics = report.topics || report.analysis?.topics || [];
    return topics.flatMap((topic) => topicSources(topic).map((source) => source.source));
  }).filter(Boolean);
  const sources = Array.from(new Set([...configuredSources, ...noticeSources, ...topicSourcesList]));
  const keywords = Array.from(new Set([
    ...(data.monitors || []).map((monitor) => monitor.keyword),
    ...(data.notifications || []).map((notice) => notice.keyword)
  ].filter(Boolean)));

  setSelectOptions($("#filterSource"), sources.map((source) => ({
    value: source,
    label: sourceLabel(source)
  })), "全部来源");
  setSelectOptions($("#filterKeyword"), keywords.map((keyword) => ({
    value: keyword,
    label: keyword
  })), "全部关键词");

  state.filters.source = $("#filterSource").value;
  state.filters.keyword = $("#filterKeyword").value;
  $("#filterImportance").value = state.filters.importance;
  $("#filterTimeRange").value = state.filters.timeRange;
  $("#sortBy").value = state.filters.sortBy;
}

function renderMetrics(data) {
  $("#monitorCountMetric").textContent = (data.monitors || []).length;
  $("#noticeCountMetric").textContent = (data.notifications || []).length;
  $("#scopeCountMetric").textContent = (data.scopes || []).length;
  $("#hotCountMetric").textContent = (data.hotTopics || []).length;
}

function watchTermSignalCount(data, keyword) {
  const notices = (data.notifications || []).filter((notice) => notice.keyword === keyword).length;
  const topics = (data.hotTopics || []).filter((report) => report.scope === keyword).length;
  return notices + topics;
}

function renderMonitors(monitors, data) {
  $("#monitorCount").textContent = monitors.length;
  $("#monitors").classList.toggle("empty", monitors.length === 0);
  $("#monitors").innerHTML = monitors.length ? monitors.map((monitor) => {
    const enabled = monitor.enabled !== false;
    const nextRun = enabled ? `下次 ${relativeTime(monitor.nextRunAt)}` : "记录已保留";
    const error = normalizeError(monitor.lastError);
    const signalCount = watchTermSignalCount(data, monitor.keyword);
    return `
      <article class="item ${enabled ? "" : "is-paused"}">
        <div class="item-head">
          <p class="item-title">${escapeHtml(monitor.keyword)}</p>
          <div class="item-actions">
            <button
              class="switch ${enabled ? "is-on" : ""}"
              data-toggle-monitor="${escapeHtml(monitor.id)}"
              data-enabled="${enabled ? "false" : "true"}"
              aria-pressed="${enabled}"
              title="${enabled ? "暂停监控" : "开启监控"}"
            >
              ${enabled ? "开启" : "暂停"}
            </button>
            <button class="delete" data-delete-monitor="${escapeHtml(monitor.id)}" title="删除" aria-label="删除关键词">×</button>
          </div>
        </div>
        <div class="meta">每 ${escapeHtml(monitor.intervalMinutes)} 分钟扫描 · ${nextRun} · ${escapeHtml(statusLabel(monitor.status, enabled))}</div>
        ${signalCount ? `<div class="meta">${signalCount} 条热点</div>` : ""}
        ${error ? `<div class="meta">来源异常：${escapeHtml(error)}</div>` : ""}
      </article>
    `;
  }).join("") : "暂无关键词，先添加一个你正在追的 AI 信号。";
}

function renderNotifications(notifications) {
  $("#noticeCount").textContent = notifications.length;
  $("#signalCount").textContent = notifications.length;
  $("#notifications").classList.toggle("empty", notifications.length === 0);
  $("#notifications").innerHTML = notifications.length ? notifications.map((notice) => {
    const verdict = notice.verdict || {};
    const item = notice.item || {};
    const tags = (verdict.tags || []).map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join("");
    const urgency = Math.round(Number(verdict.urgency || 0));
    const level = importanceLevel(urgency);
    const confidence = `${confidencePercent(verdict.confidence)}%`;
    const heat = noticeHeat(notice);
    const originalDescription = shortText(item.summary || verdict.notificationBody || item.url, 220);
    const aiSummary = shortText(verdict.notificationBody || item.summary, 260);
    const provider = [verdict.aiProvider, verdict.model].filter(Boolean).join(" / ");
    return `
      <article class="item notice-item">
        <div class="item-head">
          <p class="item-title">${escapeHtml(verdict.notificationTitle || item.title)}</p>
          <span class="heat">${urgency || "新"}</span>
        </div>
        <div class="badge-row">
          <span class="badge is-importance">${level}</span>
          <span class="badge">${escapeHtml(sourceLabel(item.source))}</span>
          ${notice.keyword ? `<span class="badge">${escapeHtml(notice.keyword)}</span>` : ""}
          ${tags}
        </div>
        <div class="signal-metrics">
          ${renderMetric("相关性", confidence)}
          ${renderMetric("热度", heat)}
          ${renderMetric("发布时间", absoluteTime(item.publishedAt))}
          ${renderMetric("发现时间", relativeTime(notice.createdAt))}
        </div>
        ${originalDescription ? `<p class="raw-description">${escapeHtml(originalDescription)}</p>` : ""}
        ${item.url ? `<a class="notice-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">查看来源</a>` : ""}
        <details class="detail-drawer">
          <summary>展开详情</summary>
          <div class="detail-grid">
            ${detailRow("AI 摘要", aiSummary)}
            ${detailRow("AI 判断理由", verdict.reason)}
            ${detailRow("原始描述", item.summary)}
            ${detailRow("来源发布时间", absoluteTime(item.publishedAt))}
            ${detailRow("系统抓取时间", absoluteTime(notice.createdAt))}
            ${detailRow("互动/热度", `综合热度 ${heat}，重要性 ${urgency || 0}，相关性 ${confidence}`)}
            ${detailRow("AI Provider", provider)}
          </div>
        </details>
      </article>
    `;
  }).join("") : "还没有真实命中，扫描后会把高价值线索放在这里。";
}

function renderScopes(scopes) {
  $("#scopeCount").textContent = scopes.length;
  $("#scopes").classList.toggle("empty", scopes.length === 0);
  $("#scopes").innerHTML = scopes.length ? scopes.map((scope) => {
    const error = normalizeError(scope.lastError);
    return `
      <article class="item">
        <div class="item-head">
          <p class="item-title">${escapeHtml(scope.scope)}</p>
          <button class="delete" data-delete-scope="${escapeHtml(scope.id)}" title="删除" aria-label="删除热点范围">×</button>
        </div>
        <div class="meta">每 ${escapeHtml(scope.intervalMinutes)} 分钟刷新 · 下次 ${relativeTime(scope.nextRunAt)} · ${escapeHtml(statusLabel(scope.status))}</div>
        ${error ? `<div class="meta">来源异常：${escapeHtml(error)}</div>` : ""}
      </article>
    `;
  }).join("") : "暂无追踪范围，添加一个领域后开始聚合趋势。";
}

function renderHotTopics(hotTopics) {
  $("#hotCount").textContent = hotTopics.length;
  $("#hotTopics").classList.toggle("empty", hotTopics.length === 0);
  $("#hotTopics").innerHTML = hotTopics.length ? hotTopics.slice(0, 6).map((report) => {
    const topics = report.topics || report.analysis?.topics || [];
    const summary = report.summary || report.analysis?.summary || "";
    const provider = report.aiProvider || report.analysis?.aiProvider || "AI";
    return `
      <article class="hot-report">
        <div class="hot-summary">
          <strong>${escapeHtml(report.scope)}</strong> · ${relativeTime(report.createdAt)} · ${escapeHtml(provider)}
          <br>${escapeHtml(summary)}
        </div>
        <div class="hot-grid">
          ${topics.map((topic) => {
            const sources = Array.isArray(topic.sources) ? topic.sources : [];
            const risk = topic.risk || "unknown";
            const heat = Math.round(Number(topic.heat || 0));
            const publishedAt = latestPublishedAt(sources);
            const sourceNames = sourceNamesFromTopic(topic);
            const sourceSummary = shortText(sources.map((source) => source.summary).filter(Boolean).join(" / ") || topic.why || topic.reason, 220);
            return `
              <div class="item topic-item">
                <div class="item-head">
                  <p class="item-title">${escapeHtml(topic.title)}</p>
                  <span class="heat">${heat}</span>
                </div>
                <div class="badge-row">
                  <span class="badge is-importance">${importanceLevel(heat)}</span>
                  <span class="badge ${risk === "low" ? "is-safe" : "is-hot"}">风险 ${escapeHtml(risk)}</span>
                  ${sourceNames ? `<span class="badge">${escapeHtml(sourceNames)}</span>` : ""}
                </div>
                <div class="signal-metrics">
                  ${renderMetric("热度", heat)}
                  ${renderMetric("发布时间", absoluteTime(publishedAt))}
                  ${renderMetric("发现时间", relativeTime(report.createdAt))}
                </div>
                ${sourceSummary ? `<p class="raw-description">${escapeHtml(sourceSummary)}</p>` : ""}
                <div class="source-links">
                  ${sources.slice(0, 3).map((source) => `<a class="notice-link" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(sourceLabel(source.source))}</a>`).join("")}
                </div>
                <details class="detail-drawer">
                  <summary>展开详情</summary>
                  <div class="detail-grid">
                    ${detailRow("AI 判断理由", topic.why || topic.reason)}
                    ${detailRow("原始描述", sources.map((source) => source.summary).filter(Boolean).join(" / "))}
                    ${detailRow("风险提示", risk)}
                    ${detailRow("来源发布时间", absoluteTime(publishedAt))}
                    ${detailRow("系统抓取时间", absoluteTime(report.createdAt))}
                    ${detailRow("互动/热度", `综合热度 ${heat}`)}
                  </div>
                </details>
              </div>
            `;
          }).join("")}
        </div>
      </article>
    `;
  }).join("") : "还没有热点报告，点击立即扫描生成第一份趋势判断。";
}

function renderSearchResults(payload) {
  const items = payload?.items || [];
  $("#searchCount").textContent = items.length;
  $("#searchTitle").textContent = payload?.query ? `搜索：${payload.query}` : "全网搜索";
  $("#searchErrors").innerHTML = (payload?.errors || [])
    .map((error) => `<div class="source-error"><strong>${escapeHtml(error.source)}</strong><span>${escapeHtml(error.message)}</span></div>`)
    .join("");
  $("#searchResults").classList.toggle("empty", items.length === 0);
  $("#searchResults").innerHTML = items.length ? items.map((item) => `
    <article class="item search-item">
      <div class="item-head">
        <p class="item-title">${escapeHtml(item.title)}</p>
        <span class="heat">${Math.round(Number(item.scoreHint || 0))}</span>
      </div>
      <div class="badge-row">
        <span class="badge">${escapeHtml(sourceLabel(item.source))}</span>
        ${item.publishedAt ? `<span class="badge">${escapeHtml(absoluteTime(item.publishedAt))}</span>` : ""}
      </div>
      ${item.summary ? `<p class="raw-description">${escapeHtml(shortText(item.summary, 220))}</p>` : ""}
      ${item.url ? `<a class="notice-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">查看来源</a>` : ""}
    </article>
  `).join("") : "输入关键词后开始搜索公开来源。";
}

function renderRealtime() {
  $("#realtimeList").classList.toggle("empty", state.realtimeEvents.length === 0);
  $("#realtimeList").innerHTML = state.realtimeEvents.length ? state.realtimeEvents.slice(0, 12).map((event) => `
    <article class="realtime-item">
      <strong>${escapeHtml(event.title || event.type || "通知")}</strong>
      <p>${escapeHtml(shortText(event.body || event.keyword || event.scope || "", 96))}</p>
      <span>${escapeHtml(relativeTime(event.createdAt))}</span>
    </article>
  `).join("") : "暂无实时通知。";
}

function maybeNotify(notifications) {
  notifications.forEach((notice) => {
    if (state.knownNotices.has(notice.id)) return;
    state.knownNotices.add(notice.id);
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(notice.verdict?.notificationTitle || notice.item?.title || "AIHot 命中通知", {
        body: notice.verdict?.notificationBody || notice.verdict?.reason || notice.keyword
      });
    }
  });
}

function connectRealtime() {
  if (!("WebSocket" in window)) {
    $("#wsStatus").textContent = "浏览器不支持 WebSocket";
    return;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
  state.ws = ws;

  ws.addEventListener("open", () => {
    $("#wsStatus").textContent = "实时连接中";
  });

  ws.addEventListener("message", (event) => {
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (payload.type === "connected") {
      $("#wsStatus").textContent = "实时连接中";
      return;
    }

    state.realtimeEvents.unshift({
      ...payload,
      createdAt: payload.createdAt || new Date().toISOString()
    });
    state.realtimeEvents = state.realtimeEvents.slice(0, 30);
    renderRealtime();
    loadState().catch(() => {});
  });

  ws.addEventListener("close", () => {
    $("#wsStatus").textContent = "已断开，重连中";
    window.setTimeout(connectRealtime, 3000);
  });

  ws.addEventListener("error", () => {
    $("#wsStatus").textContent = "连接异常";
  });
}

function render(data) {
  state.data = data;
  const provider = data.config?.aiProviderLabel || "AI Provider";
  $("#aiStatus").textContent = data.config?.hasAiKey
    ? `${provider} 已连接 · ${data.config.model}`
    : `${provider} 未配置 · 本地规则兜底`;
  renderMetrics(data);
  renderFilterOptions(data);
  renderSources(data.config?.sources || []);
  renderMonitors(data.monitors || [], data);
  renderNotifications(filterAndSortNotifications(data.notifications || []));
  renderHotTopics(filterAndSortHotTopics(data.hotTopics || []));
  if (state.searchResults) renderSearchResults(state.searchResults);
  renderRealtime();
  maybeNotify(data.notifications || []);
}

async function loadState() {
  const data = await api("/api/state");
  render(data);
}

async function submitJson(form, path, map) {
  const submitButton = form.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, "保存中");
  const payload = map(Object.fromEntries(new FormData(form).entries()));
  try {
    const data = await api(path, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    form.reset();
    render(data);
    toast("已保存。重复关键词会重新开启，不会创建多份。");
  } finally {
    setButtonBusy(submitButton, false);
  }
}

document.querySelectorAll(".mode-tab").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

$("#watchTermForm").addEventListener("submit", (event) => {
  event.preventDefault();
  submitJson(event.currentTarget, "/api/watch-terms", (body) => ({
    term: body.term,
    intervalMinutes: 30,
    enabled: true
  })).catch((error) => toast(error.message));
});

$("#searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const query = String(new FormData(form).get("query") || "").trim();
  if (!query) return;
  setButtonBusy(button, true, "搜索中");
  try {
    state.searchResults = await api("/api/search", {
      method: "POST",
      body: JSON.stringify({ query })
    });
    setMode("search");
    renderSearchResults(state.searchResults);
    toast("搜索完成。");
  } catch (error) {
    toast(error.message);
  } finally {
    setButtonBusy(button, false);
  }
});

[
  ["filterSource", "source"],
  ["filterImportance", "importance"],
  ["filterKeyword", "keyword"],
  ["filterTimeRange", "timeRange"],
  ["sortBy", "sortBy"]
].forEach(([id, key]) => {
  const control = $(`#${id}`);
  if (!control) return;
  control.addEventListener("change", () => {
    state.filters[key] = control.value;
    if (state.data) render(state.data);
  });
});

$("#resetFilters").addEventListener("click", () => {
  state.filters = {
    source: "all",
    importance: "all",
    keyword: "all",
    timeRange: "all",
    sortBy: "importance"
  };
  if (state.data) render(state.data);
});

$("#markRealtimeRead").addEventListener("click", () => {
  state.realtimeEvents = [];
  renderRealtime();
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const monitorId = button.dataset.deleteMonitor;
  const toggleMonitorId = button.dataset.toggleMonitor;
  const scopeId = button.dataset.deleteScope;
  try {
    if (monitorId) {
      setButtonBusy(button, true, "...");
      render(await api(`/api/watch-terms/${monitorId}`, { method: "DELETE" }));
    }
    if (toggleMonitorId) {
      const enabled = button.dataset.enabled === "true";
      setButtonBusy(button, true, enabled ? "开启中" : "暂停中");
      render(await api(`/api/watch-terms/${toggleMonitorId}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled })
      }));
      toast(enabled ? "关键词监控已开启。" : "关键词已暂停，记录仍保留。");
    }
    if (scopeId) {
      setButtonBusy(button, true, "...");
      render(await api(`/api/scopes/${scopeId}`, { method: "DELETE" }));
    }
  } catch (error) {
    setButtonBusy(button, false);
    toast(error.message);
  }
});

$("#refreshAll").addEventListener("click", async () => {
  const button = $("#refreshAll");
  setButtonBusy(button, true, "<span>扫描中</span>");
  toast("扫描中，AI 正在过滤噪声...");
  try {
    const result = await api("/api/refresh", {
      method: "POST",
      body: JSON.stringify({ target: "all" })
    });
    render(result.state);
    toast("扫描完成，新的信号已经同步。");
  } catch (error) {
    toast(error.message);
  } finally {
    setButtonBusy(button, false);
  }
});

$("#enableNotify").addEventListener("click", async () => {
  const button = $("#enableNotify");
  setButtonBusy(button, true, "请求授权");
  if (!("Notification" in window)) {
    setButtonBusy(button, false);
    toast("当前浏览器不支持通知。");
    return;
  }
  const permission = await Notification.requestPermission();
  setButtonBusy(button, false);
  toast(permission === "granted" ? "浏览器通知已开启。" : "通知未授权。");
});

setMode("radar");
renderRealtime();
connectRealtime();
loadState().catch((error) => toast(error.message));
window.setInterval(loadState, 30000);
