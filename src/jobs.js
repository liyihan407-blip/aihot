const { evaluateMonitorItem, getAiConfig, summarizeHotspots } = require("./ai");
const { collectSources, SOURCE_NAMES } = require("./sources");
const { mutateState, readState } = require("./store");
const { clampNumber, hashText, nowIso, uid } = require("./utils");

const DEFAULT_INTERVAL_MINUTES = 30;
let running = false;

function decorateState(state) {
  const ai = getAiConfig();
  return {
    ...state,
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
  const clean = String(keyword || "").trim();
  if (!clean) throw new Error("关键词不能为空。");
  return mutateState((state) => {
    state.monitors.unshift({
      id: uid("mon"),
      keyword: clean,
      intervalMinutes: clampNumber(intervalMinutes, 5, 1440, DEFAULT_INTERVAL_MINUTES),
      createdAt: nowIso(),
      lastRunAt: null,
      nextRunAt: nowIso(),
      status: "waiting",
      lastError: ""
    });
    return state;
  });
}

function createScope(scope, intervalMinutes) {
  const clean = String(scope || "").trim();
  if (!clean) throw new Error("范围不能为空。");
  return mutateState((state) => {
    state.scopes.unshift({
      id: uid("scope"),
      scope: clean,
      intervalMinutes: clampNumber(intervalMinutes, 10, 1440, 60),
      createdAt: nowIso(),
      lastRunAt: null,
      nextRunAt: nowIso(),
      status: "waiting",
      lastError: ""
    });
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
      mutateState((draft) => {
        draft.seen[seenKey] = nowIso();
        draft.notifications.unshift({
          id: uid("notice"),
          monitorId: monitor.id,
          keyword: monitor.keyword,
          item,
          verdict,
          createdAt: nowIso(),
          read: false
        });
        draft.notifications = draft.notifications.slice(0, 100);
        return draft;
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
  if (!due(scopeItem, force)) return { skipped: true };
  const collected = await collectSources(scopeItem.scope);
  const summary = await summarizeHotspots(scopeItem.scope, collected.items);

  mutateState((draft) => {
    const sourceMap = new Map(collected.items.map((item) => [item.id, item]));
    const current = draft.scopes.find((item) => item.id === scopeItem.id);
    if (current) {
      current.status = "ok";
      current.lastError = collected.errors.map((error) => `${error.source}: ${error.message}`).join("; ");
      scheduleNext(current);
    }
    draft.hotTopics.unshift({
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
    });
    draft.hotTopics = draft.hotTopics.slice(0, 40);
    return draft;
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
  runDueJobs,
  startScheduler
};
