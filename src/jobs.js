const { evaluateMonitorItem, getAiConfig, summarizeHotspots } = require("./ai");
const { collectSources, SOURCE_NAMES } = require("./sources");
const { mutateState, readState } = require("./store");
const { clampNumber, hashText, nowIso, uid } = require("./utils");

const DEFAULT_INTERVAL_MINUTES = 30;
let running = false;
const jobListeners = new Set();

function emitJobEvent(event) {
  for (const listener of jobListeners) {
    try {
      listener(event);
    } catch {
      // Keep job execution isolated from realtime clients.
    }
  }
}

function subscribeJobEvents(listener) {
  jobListeners.add(listener);
  return () => jobListeners.delete(listener);
}

function decorateState(state) {
  const ai = getAiConfig();
  return {
    ...state,
    monitors: (state.monitors || []).map((monitor) => ({
      ...monitor,
      enabled: monitor.enabled !== false
    })),
    config: {
      aiProvider: ai.provider,
      aiProviderLabel: ai.providerLabel,
      hasAiKey: ai.configured,
      hasOpenRouterKey: ai.provider === "openrouter" && ai.configured,
      model: ai.model,
      sources: SOURCE_NAMES
    }
  };
}

function createMonitor(keyword, intervalMinutes) {
  return saveKeyword(keyword, { intervalMinutes, enabled: true });
}

function saveKeyword(keyword, options = {}) {
  const clean = String(keyword || "").trim();
  if (!clean) throw new Error("Keyword is required.");
  const enabled = options.enabled !== false;
  const intervalMinutes = options.intervalMinutes;

  return mutateState((state) => {
    const existing = (state.monitors || []).find((monitor) => monitor.keyword === clean);
    if (existing) {
      existing.intervalMinutes = clampNumber(intervalMinutes, 5, 1440, existing.intervalMinutes || DEFAULT_INTERVAL_MINUTES);
      existing.enabled = enabled;
      existing.status = enabled ? "waiting" : "paused";
      existing.nextRunAt = enabled ? nowIso() : null;
      existing.lastError = "";
      return state;
    }

    state.monitors.unshift({
      id: uid("mon"),
      keyword: clean,
      intervalMinutes: clampNumber(intervalMinutes, 5, 1440, DEFAULT_INTERVAL_MINUTES),
      enabled,
      createdAt: nowIso(),
      lastRunAt: null,
      nextRunAt: enabled ? nowIso() : null,
      status: enabled ? "waiting" : "paused",
      lastError: ""
    });
    return state;
  });
}

function updateMonitor(id, patch = {}) {
  const next = mutateState((state) => {
    const monitor = (state.monitors || []).find((item) => item.id === id);
    if (!monitor) throw new Error("Monitor not found.");

    if (typeof patch.enabled === "boolean") {
      monitor.enabled = patch.enabled;
      monitor.status = patch.enabled ? "waiting" : "paused";
      monitor.nextRunAt = patch.enabled ? nowIso() : null;
      monitor.lastError = "";
    }

    if (patch.intervalMinutes !== undefined) {
      monitor.intervalMinutes = clampNumber(patch.intervalMinutes, 5, 1440, monitor.intervalMinutes || DEFAULT_INTERVAL_MINUTES);
      if (monitor.enabled !== false) monitor.nextRunAt = nowIso();
    }

    return state;
  });
  const monitor = (next.monitors || []).find((item) => item.id === id);
  if (monitor && typeof patch.enabled === "boolean") {
    syncScopeEnabled(monitor.keyword, patch.enabled);
  }
  return readState();
}

function createScope(scope, intervalMinutes, options = {}) {
  const clean = String(scope || "").trim();
  if (!clean) throw new Error("Scope is required.");
  return mutateState((state) => {
    const existing = (state.scopes || []).find((item) => item.scope === clean);
    if (existing) {
      existing.intervalMinutes = clampNumber(intervalMinutes, 10, 1440, existing.intervalMinutes || 60);
      if (typeof options.enabled === "boolean") {
        existing.enabled = options.enabled;
        existing.status = options.enabled ? "waiting" : "paused";
        existing.nextRunAt = options.enabled ? nowIso() : null;
      }
      return state;
    }

    state.scopes.unshift({
      id: uid("scope"),
      scope: clean,
      intervalMinutes: clampNumber(intervalMinutes, 10, 1440, 60),
      enabled: options.enabled !== false,
      createdAt: nowIso(),
      lastRunAt: null,
      nextRunAt: options.enabled === false ? null : nowIso(),
      status: options.enabled === false ? "paused" : "waiting",
      lastError: ""
    });
    return state;
  });
}

function syncScopeEnabled(scope, enabled) {
  return mutateState((state) => {
    const current = (state.scopes || []).find((item) => item.scope === scope);
    if (current) {
      current.enabled = enabled;
      current.status = enabled ? "waiting" : "paused";
      current.nextRunAt = enabled ? nowIso() : null;
      current.lastError = "";
    }
    return state;
  });
}

function saveWatchTerm(term, options = {}) {
  const intervalMinutes = options.intervalMinutes || DEFAULT_INTERVAL_MINUTES;
  const enabled = options.enabled !== false;
  saveKeyword(term, { intervalMinutes, enabled });
  createScope(term, Math.max(10, Number(intervalMinutes) || DEFAULT_INTERVAL_MINUTES), { enabled });
  return readState();
}

function updateWatchTerm(id, patch = {}) {
  return updateMonitor(id, patch);
}

function removeWatchTerm(id) {
  return mutateState((state) => {
    const monitor = (state.monitors || []).find((item) => item.id === id);
    state.monitors = (state.monitors || []).filter((item) => item.id !== id);
    if (monitor) {
      state.scopes = (state.scopes || []).filter((item) => item.scope !== monitor.keyword);
      state.hotTopics = (state.hotTopics || []).filter((item) => item.scope !== monitor.keyword);
    }
    return state;
  });
}

function removeEntity(kind, id) {
  const key = kind === "monitor" ? "monitors" : "scopes";
  return mutateState((state) => {
    state[key] = state[key].filter((item) => item.id !== id);
    return state;
  });
}

function due(item, force = false) {
  return force || !item.nextRunAt || new Date(item.nextRunAt).getTime() <= Date.now();
}

function scheduleNext(item) {
  const minutes = clampNumber(item.intervalMinutes, 5, 1440, DEFAULT_INTERVAL_MINUTES);
  item.lastRunAt = nowIso();
  item.nextRunAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function runMonitor(monitor, force = false) {
  if (monitor.enabled === false) return { skipped: true, disabled: true };
  if (!due(monitor, force)) return { skipped: true };
  const collected = await collectSources(monitor.keyword);
  const results = [];

  for (const item of collected.items.slice(0, 10)) {
    const seenKey = hashText(`monitor:${monitor.id}:${item.id}`);
    const state = readState();
    if (state.seen[seenKey]) continue;
    const verdict = await evaluateMonitorItem(monitor.keyword, item);
    results.push({ item, verdict });

    if (verdict.isRelevant && !verdict.isImpersonation && Number(verdict.confidence) >= 0.55) {
      let notification = null;
      mutateState((draft) => {
        draft.seen[seenKey] = nowIso();
        notification = {
          id: uid("notice"),
          monitorId: monitor.id,
          keyword: monitor.keyword,
          item,
          verdict,
          createdAt: nowIso(),
          read: false
        };
        draft.notifications.unshift(notification);
        draft.notifications = draft.notifications.slice(0, 100);
        return draft;
      });
      emitJobEvent({
        type: "notification",
        title: verdict.notificationTitle || item.title,
        body: verdict.notificationBody || verdict.reason || item.summary || "",
        keyword: monitor.keyword,
        source: item.source,
        createdAt: notification.createdAt,
        notification
      });
    } else {
      mutateState((draft) => {
        draft.seen[seenKey] = nowIso();
        return draft;
      });
    }
  }

  mutateState((draft) => {
    const current = draft.monitors.find((item) => item.id === monitor.id);
    if (current) {
      current.status = "ok";
      current.lastError = collected.errors.map((error) => `${error.source}: ${error.message}`).join("; ");
      scheduleNext(current);
    }
    return draft;
  });

  return { skipped: false, checked: results.length, sourceErrors: collected.errors };
}

async function runScope(scopeItem, force = false) {
  if (scopeItem.enabled === false) return { skipped: true, disabled: true };
  if (!due(scopeItem, force)) return { skipped: true };
  const collected = await collectSources(scopeItem.scope);
  const summary = await summarizeHotspots(scopeItem.scope, collected.items);
  let record = null;

  mutateState((draft) => {
    const sourceMap = new Map(collected.items.map((item) => [item.id, item]));
    const current = draft.scopes.find((item) => item.id === scopeItem.id);
    if (current) {
      current.status = "ok";
      current.lastError = collected.errors.map((error) => `${error.source}: ${error.message}`).join("; ");
      scheduleNext(current);
    }
    record = {
      id: uid("hot"),
      scopeId: scopeItem.id,
      scope: scopeItem.scope,
      createdAt: nowIso(),
      summary: summary.summary || "",
      aiProvider: summary.aiProvider || "unknown",
      model: summary.model || "",
      topics: (summary.topics || []).slice(0, 10).map((topic) => ({
        ...topic,
        sources: (topic.sourceIds || [])
          .map((id) => sourceMap.get(id))
          .filter(Boolean)
      }))
    };
    draft.hotTopics.unshift(record);
    draft.hotTopics = draft.hotTopics.slice(0, 40);
    return draft;
  });
  emitJobEvent({
    type: "hotspot",
    title: `发现新热点：${record.topics[0]?.title || scopeItem.scope}`,
    body: summary.summary || record.topics[0]?.why || "",
    scope: scopeItem.scope,
    createdAt: record.createdAt,
    report: record
  });

  return { skipped: false, topics: summary.topics ? summary.topics.length : 0, sourceErrors: collected.errors };
}

async function runDueJobs(options = {}) {
  if (running) return { running: true };
  running = true;
  const force = Boolean(options.force);
  const target = options.target || "all";
  const state = readState();
  const report = { monitors: [], scopes: [] };

  try {
    if (target === "all" || target === "monitors") {
      for (const monitor of state.monitors) {
        if (monitor.enabled === false) {
          report.monitors.push({ id: monitor.id, result: { skipped: true, disabled: true } });
          continue;
        }

        try {
          report.monitors.push({ id: monitor.id, result: await runMonitor(monitor, force) });
        } catch (error) {
          mutateState((draft) => {
            const current = draft.monitors.find((item) => item.id === monitor.id);
            if (current) {
              current.status = "error";
              current.lastError = error.message;
              scheduleNext(current);
            }
            return draft;
          });
          report.monitors.push({ id: monitor.id, error: error.message });
        }
      }
    }

    if (target === "all" || target === "scopes") {
      for (const scope of state.scopes) {
        if (scope.enabled === false) {
          report.scopes.push({ id: scope.id, result: { skipped: true, disabled: true } });
          continue;
        }

        try {
          report.scopes.push({ id: scope.id, result: await runScope(scope, force) });
        } catch (error) {
          mutateState((draft) => {
            const current = draft.scopes.find((item) => item.id === scope.id);
            if (current) {
              current.status = "error";
              current.lastError = error.message;
              scheduleNext(current);
            }
            return draft;
          });
          report.scopes.push({ id: scope.id, error: error.message });
        }
      }
    }
  } finally {
    running = false;
  }

  return report;
}

function startScheduler() {
  const interval = clampNumber(process.env.POLL_SECONDS, 15, 3600, 60) * 1000;
  setInterval(() => {
    runDueJobs().catch(() => {});
  }, interval).unref();
}

module.exports = {
  createMonitor,
  createScope,
  decorateState,
  removeEntity,
  removeWatchTerm,
  saveKeyword,
  saveWatchTerm,
  subscribeJobEvents,
  updateMonitor,
  updateWatchTerm,
  runDueJobs,
  startScheduler
};
