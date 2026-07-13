const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("saveKeyword preserves disabled keywords and re-enables existing records", () => {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aihot-keyword-"));
  const jobsPath = require.resolve("../src/jobs");
  const storePath = require.resolve("../src/store");
  delete require.cache[jobsPath];
  delete require.cache[storePath];

  try {
    process.chdir(tempDir);
    const { saveKeyword, updateMonitor } = require("../src/jobs");
    const { readState } = require("../src/store");

    let state = saveKeyword("Claude Code", { enabled: false, intervalMinutes: 12 });
    assert.equal(state.monitors.length, 1);
    assert.equal(state.monitors[0].keyword, "Claude Code");
    assert.equal(state.monitors[0].enabled, false);
    assert.equal(state.monitors[0].status, "paused");
    assert.equal(state.monitors[0].nextRunAt, null);

    const id = state.monitors[0].id;
    state = updateMonitor(id, { enabled: true });
    assert.equal(state.monitors[0].enabled, true);
    assert.equal(state.monitors[0].status, "waiting");
    assert.ok(state.monitors[0].nextRunAt);

    state = saveKeyword("Claude Code", { intervalMinutes: 20 });
    assert.equal(state.monitors.length, 1);
    assert.equal(state.monitors[0].id, id);
    assert.equal(state.monitors[0].enabled, true);
    assert.equal(state.monitors[0].intervalMinutes, 20);
    assert.deepEqual(readState().monitors.map((monitor) => monitor.keyword), ["Claude Code"]);
  } finally {
    process.chdir(originalCwd);
    delete require.cache[jobsPath];
    delete require.cache[storePath];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
