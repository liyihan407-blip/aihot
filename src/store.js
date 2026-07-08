const fs = require("fs");
const path = require("path");
const { nowIso } = require("./utils");

const dataDir = path.join(process.cwd(), "data");
const statePath = path.join(dataDir, "state.json");

const defaultState = {
  version: 1,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  monitors: [],
  scopes: [],
  notifications: [],
  hotTopics: [],
  seen: {}
};

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, JSON.stringify(defaultState, null, 2));
  }
}

function readState() {
  ensureStore();
  const raw = fs.readFileSync(statePath, "utf8");
  try {
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return { ...defaultState, updatedAt: nowIso() };
  }
}

function writeState(state) {
  ensureStore();
  const next = { ...state, updatedAt: nowIso() };
  fs.writeFileSync(statePath, JSON.stringify(next, null, 2));
  return next;
}

function mutateState(mutator) {
  const state = readState();
  const result = mutator(state) || state;
  return writeState(result);
}

module.exports = {
  readState,
  writeState,
  mutateState,
  statePath
};
