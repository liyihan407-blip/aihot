const state = {
  data: null,
  knownNotices: new Set()
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function relativeTime(value) {
  if (!value) return "尚未运行";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(Math.abs(diff) / 60000);
  const suffix = diff >= 0 ? "前" : "后";
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟${suffix}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时${suffix}`;
  return new Date(value).toLocaleString();
}

function renderSources(sources) {
  $("#sourceList").innerHTML = (sources || [])
    .map((source) => `<span class="source-chip">${escapeHtml(source)}</span>`)
    .join("");
}

function renderMonitors(monitors) {
  $("#monitorCount").textContent = monitors.length;
  $("#monitors").classList.toggle("empty", monitors.length === 0);
  $("#monitors").innerHTML = monitors.length ? monitors.map((monitor) => `
    <article class="item">
      <div class="item-head">
        <p class="item-title">${escapeHtml(monitor.keyword)}</p>
        <button class="delete" data-delete-monitor="${monitor.id}" title="删除" aria-label="删除关键词">×</button>
      </div>
      <div class="meta">每 ${monitor.intervalMinutes} 分钟扫描 · 下次 ${relativeTime(monitor.nextRunAt)} · ${escapeHtml(monitor.status)}</div>
      ${monitor.lastError ? `<div class="meta">来源异常：${escapeHtml(monitor.lastError)}</div>` : ""}
    </article>
  `).join("") : "暂无关键词";
}

function renderNotifications(notifications) {
  $("#noticeCount").textContent = notifications.length;
  $("#signalCount").textContent = notifications.length;
  $("#notifications").classList.toggle("empty", notifications.length === 0);
  $("#notifications").innerHTML = notifications.length ? notifications.map((notice) => {
    const tags = (notice.verdict.tags || []).map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join("");
    return `
      <article class="item notice-item">
        <div class="item-head">
          <p class="item-title">${escapeHtml(notice.verdict.notificationTitle || notice.item.title)}</p>
          <span class="heat">${Math.round(Number(notice.verdict.urgency || 0))}</span>
        </div>
        <div class="meta">${escapeHtml(notice.keyword)} · ${escapeHtml(notice.item.source)} · ${relativeTime(notice.createdAt)}</div>
        <p class="meta">${escapeHtml(notice.verdict.reason || notice.verdict.notificationBody || "")}</p>
        <a class="notice-link" href="${escapeHtml(notice.item.url)}" target="_blank" rel="noreferrer">查看来源</a>
        <div class="badge-row">${tags}<span class="badge">置信 ${Math.round(Number(notice.verdict.confidence || 0) * 100)}%</span></div>
      </article>
    `;
  }).join("") : "还没有真实命中";
}

function renderScopes(scopes) {
  $("#scopeCount").textContent = scopes.length;
  $("#scopes").classList.toggle("empty", scopes.length === 0);
  $("#scopes").innerHTML = scopes.length ? scopes.map((scope) => `
    <article class="item">
      <div class="item-head">
        <p class="item-title">${escapeHtml(scope.scope)}</p>
        <button class="delete" data-delete-scope="${scope.id}" title="删除" aria-label="删除热点范围">×</button>
      </div>
      <div class="meta">每 ${scope.intervalMinutes} 分钟刷新 · 下次 ${relativeTime(scope.nextRunAt)} · ${escapeHtml(scope.status)}</div>
      ${scope.lastError ? `<div class="meta">来源异常：${escapeHtml(scope.lastError)}</div>` : ""}
    </article>
  `).join("") : "暂无追踪范围";
}

function renderHotTopics(hotTopics) {
  $("#hotCount").textContent = hotTopics.length;
  $("#hotTopics").classList.toggle("empty", hotTopics.length === 0);
  $("#hotTopics").innerHTML = hotTopics.length ? hotTopics.slice(0, 6).map((report) => `
    <article class="hot-report">
      <div class="hot-summary">
        <strong>${escapeHtml(report.scope)}</strong> · ${relativeTime(report.createdAt)} · ${escapeHtml(report.aiProvider)}
        <br>${escapeHtml(report.summary)}
      </div>
      <div class="hot-grid">
        ${(report.topics || []).map((topic) => `
          <div class="item">
            <div class="item-head">
              <p class="item-title">${escapeHtml(topic.title)}</p>
              <span class="heat">${Math.round(Number(topic.heat || 0))}</span>
            </div>
            <p class="meta">${escapeHtml(topic.why || "")}</p>
            <div class="badge-row">
              <span class="badge">风险 ${escapeHtml(topic.risk || "unknown")}</span>
              ${(topic.sources || []).slice(0, 2).map((source) => `<a class="notice-link" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.source)}</a>`).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </article>
  `).join("") : "还没有热点报告";
}

function maybeNotify(notifications) {
  notifications.forEach((notice) => {
    if (state.knownNotices.has(notice.id)) return;
    state.knownNotices.add(notice.id);
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(notice.verdict.notificationTitle || notice.item.title, {
        body: notice.verdict.notificationBody || notice.verdict.reason || notice.keyword
      });
    }
  });
}

function render(data) {
  state.data = data;
  const provider = data.config.aiProviderLabel || "AI Provider";
  $("#aiStatus").textContent = data.config.hasAiKey
    ? `${provider} 已连接 · ${data.config.model}`
    : `${provider} 未配置 · 本地规则回退`;
  renderSources(data.config.sources || []);
  renderMonitors(data.monitors || []);
  renderNotifications(data.notifications || []);
  renderScopes(data.scopes || []);
  renderHotTopics(data.hotTopics || []);
  maybeNotify(data.notifications || []);
}

async function loadState() {
  const data = await api("/api/state");
  render(data);
}

async function submitJson(form, path, map) {
  const payload = map(Object.fromEntries(new FormData(form).entries()));
  const data = await api(path, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  form.reset();
  render(data);
  toast("已加入队列，可点击立即扫描。");
}

$("#monitorForm").addEventListener("submit", (event) => {
  event.preventDefault();
  submitJson(event.currentTarget, "/api/monitors", (body) => body).catch((error) => toast(error.message));
});

$("#scopeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  submitJson(event.currentTarget, "/api/scopes", (body) => body).catch((error) => toast(error.message));
});

document.addEventListener("click", async (event) => {
  const monitorId = event.target.dataset.deleteMonitor;
  const scopeId = event.target.dataset.deleteScope;
  try {
    if (monitorId) render(await api(`/api/monitors/${monitorId}`, { method: "DELETE" }));
    if (scopeId) render(await api(`/api/scopes/${scopeId}`, { method: "DELETE" }));
  } catch (error) {
    toast(error.message);
  }
});

$("#refreshAll").addEventListener("click", async () => {
  toast("扫描中，AI 正在过滤噪声...");
  try {
    const result = await api("/api/refresh", {
      method: "POST",
      body: JSON.stringify({ target: "all" })
    });
    render(result.state);
    toast("扫描完成。");
  } catch (error) {
    toast(error.message);
  }
});

$("#enableNotify").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    toast("当前浏览器不支持通知。");
    return;
  }
  const permission = await Notification.requestPermission();
  toast(permission === "granted" ? "浏览器通知已开启。" : "通知未授权。");
});

loadState().catch((error) => toast(error.message));
window.setInterval(loadState, 30000);
