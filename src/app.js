import { AiClient } from "./ai.js";
import { collectFromSources } from "./sources.js";
import { Store } from "./store.js";
import { clamp, hash, id } from "./utils.js";

export function createApp(options) {
  const store = new Store(options.dataFile);
  const ai = new AiClient(process.env);
  let timer = null;

  async function init() {
    await store.init();
  }

  async function getState() {
    const state = store.snapshot();
    return {
      ...state,
      config: {
        openRouterConfigured: ai.configured,
        model: ai.model,
        sources: ["Google News", "Hacker News", "GitHub"]
      }
    };
  }

  async function addMonitor(input) {
    const keyword = cleanText(input.keyword);
    if (!keyword) throw badRequest("Keyword is required.");
    const intervalMinutes = clamp(input.intervalMinutes || store.state.settings.monitorIntervalMinutes, 2, 1440);
    return store.mutate((state) => {
      const monitor = {
        id: id("mon"),
        keyword,
        intervalMinutes,
        createdAt: new Date().toISOString(),
        lastRunAt: null,
        status: "idle",
        lastError: null,
        hitCount: 0
      };
      state.monitors.unshift(monitor);
      return monitor;
    });
  }

  async function removeMonitor(monitorId) {
    return store.mutate((state) => {
      state.monitors = state.monitors.filter((monitor) => monitor.id !== monitorId);
      return { ok: true };
    });
  }

  async function addScope(input) {
    const scope = cleanText(input.scope);
    if (!scope) throw badRequest("Scope is required.");
    const intervalMinutes = clamp(input.intervalMinutes || store.state.settings.hotspotIntervalMinutes, 5, 1440);
    return store.mutate((state) => {
      const item = {
        id: id("scope"),
        scope,
        intervalMinutes,
        createdAt: new Date().toISOString(),
        lastRunAt: null,
        status: "idle",
        lastError: null
      };
      state.scopes.unshift(item);
      return item;
    });
  }

  async function removeScope(scopeId) {
    return store.mutate((state) => {
      state.scopes = state.scopes.filter((scope) => scope.id !== scopeId);
      state.hotTopics = state.hotTopics.filter((topic) => topic.scopeId !== scopeId);
      return { ok: true };
    });
  }

  async function updateSettings(input) {
    return store.mutate((state) => {
      state.settings.monitorIntervalMinutes = clamp(input.monitorIntervalMinutes || state.settings.monitorIntervalMinutes, 2, 1440);
      state.settings.hotspotIntervalMinutes = clamp(input.hotspotIntervalMinutes || state.settings.hotspotIntervalMinutes, 5, 1440);
      state.settings.minConfidence = clamp(input.minConfidence ?? state.settings.minConfidence, 0.1, 0.95);
      state.settings.maxItemsPerSource = clamp(input.maxItemsPerSource || state.settings.maxItemsPerSource, 3, 20);
      return state.settings;
    });
  }

  async function refresh(input = {}) {
    const type = input.type || "all";
    const state = store.snapshot();
    const results = [];
    if (type === "all" || type === "monitors") {
      for (const monitor of state.monitors) results.push(await runMonitor(monitor.id));
    }
    if (type === "all" || type === "hotspots") {
      for (const scope of state.scopes) results.push(await runScope(scope.id));
    }
    return { ok: true, results };
  }

  async function runMonitor(monitorId) {
    const monitor = store.state.monitors.find((item) => item.id === monitorId);
    if (!monitor) return { ok: false, id: monitorId, error: "Monitor not found" };
    await markMonitor(monitorId, { status: "running", lastError: null });
    try {
      const state = store.snapshot();
      const collected = await collectFromSources(monitor.keyword, { limit: state.settings.maxItemsPerSource });
      const hits = [];

      for (const item of collected.items) {
        const seenKey = `monitor:${monitor.id}:${item.id}`;
        if (state.seen[seenKey]) continue;
        const verdict = await ai.evaluateMonitor(monitor.keyword, item);
        const shouldNotify = verdict.isRelevant && !verdict.isImpersonation && verdict.confidence >= state.settings.minConfidence;
        await store.mutate((draft) => {
          draft.seen[seenKey] = new Date().toISOString();
        });
        if (!shouldNotify) continue;
        const notification = {
          id: id("note"),
          monitorId: monitor.id,
          keyword: monitor.keyword,
          item,
          verdict,
          createdAt: new Date().toISOString(),
          read: false
        };
        await store.mutate((draft) => {
          draft.notifications.unshift(notification);
          draft.notifications = draft.notifications.slice(0, 120);
          const current = draft.monitors.find((entry) => entry.id === monitor.id);
          if (current) current.hitCount += 1;
        });
        hits.push(notification);
      }

      await markMonitor(monitorId, {
        status: "idle",
        lastRunAt: new Date().toISOString(),
        lastError: collected.errors.join("; ") || null
      });
      return { ok: true, id: monitorId, hits: hits.length, sourceErrors: collected.errors };
    } catch (error) {
      await markMonitor(monitorId, { status: "error", lastRunAt: new Date().toISOString(), lastError: error.message });
      return { ok: false, id: monitorId, error: error.message };
    }
  }

  async function runScope(scopeId) {
    const scope = store.state.scopes.find((item) => item.id === scopeId);
    if (!scope) return { ok: false, id: scopeId, error: "Scope not found" };
    await markScope(scopeId, { status: "running", lastError: null });
    try {
      const state = store.snapshot();
      const collected = await collectFromSources(scope.scope, { limit: state.settings.maxItemsPerSource });
      const analysis = await ai.rankHotspots(scope.scope, collected.items);
      const record = {
        id: id("hot"),
        scopeId,
        scope: scope.scope,
        analysis,
        sourceErrors: collected.errors,
        createdAt: new Date().toISOString()
      };
      await store.mutate((draft) => {
        draft.hotTopics = [record, ...draft.hotTopics.filter((topic) => topic.scopeId !== scopeId)].slice(0, 40);
      });
      await markScope(scopeId, {
        status: "idle",
        lastRunAt: new Date().toISOString(),
        lastError: collected.errors.join("; ") || null
      });
      return { ok: true, id: scopeId, topics: analysis.topics.length, sourceErrors: collected.errors };
    } catch (error) {
      await markScope(scopeId, { status: "error", lastRunAt: new Date().toISOString(), lastError: error.message });
      return { ok: false, id: scopeId, error: error.message };
    }
  }

  function startScheduler() {
    if (timer) return;
    timer = setInterval(tick, 60_000);
    setTimeout(tick, 1500);
  }

  async function tick() {
    const state = store.snapshot();
    const now = Date.now();
    for (const monitor of state.monitors) {
      if (isDue(monitor, now)) runMonitor(monitor.id);
    }
    for (const scope of state.scopes) {
      if (isDue(scope, now)) runScope(scope.id);
    }
  }

  function isDue(item, now) {
    if (item.status === "running") return false;
    if (!item.lastRunAt) return true;
    return now - new Date(item.lastRunAt).getTime() >= item.intervalMinutes * 60_000;
  }

  async function markMonitor(monitorId, patch) {
    await store.mutate((state) => {
      const monitor = state.monitors.find((item) => item.id === monitorId);
      if (monitor) Object.assign(monitor, patch);
    });
  }

  async function markScope(scopeId, patch) {
    await store.mutate((state) => {
      const scope = state.scopes.find((item) => item.id === scopeId);
      if (scope) Object.assign(scope, patch);
    });
  }

  return {
    init,
    getState,
    addMonitor,
    removeMonitor,
    addScope,
    removeScope,
    refresh,
    updateSettings,
    startScheduler,
    runMonitor,
    runScope
  };
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
