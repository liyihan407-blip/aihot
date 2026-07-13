const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./src/env");
const { getAiConfig } = require("./src/ai");
const { createMonitor, createScope, decorateState, removeEntity, runDueJobs, saveKeyword, startScheduler, updateMonitor } = require("./src/jobs");
const { readState } = require("./src/store");

loadEnv();

const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 8787);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, "http://localhost");

  try {
    if (req.method === "GET" && url.pathname === "/api/state") {
      return sendJson(res, 200, decorateState(readState()));
    }

    if (req.method === "GET" && url.pathname === "/api/keywords") {
      const state = decorateState(readState());
      return sendJson(res, 200, { keywords: state.monitors });
    }

    if (req.method === "POST" && url.pathname === "/api/keywords") {
      const body = await readBody(req);
      return sendJson(res, 201, decorateState(saveKeyword(body.keyword, {
        intervalMinutes: body.intervalMinutes,
        enabled: body.enabled
      })));
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/keywords/")) {
      const id = url.pathname.split("/").pop();
      const body = await readBody(req);
      return sendJson(res, 200, decorateState(updateMonitor(id, body)));
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/keywords/")) {
      const id = url.pathname.split("/").pop();
      return sendJson(res, 200, decorateState(removeEntity("monitor", id)));
    }

    if (req.method === "POST" && url.pathname === "/api/monitors") {
      const body = await readBody(req);
      return sendJson(res, 201, decorateState(createMonitor(body.keyword, body.intervalMinutes)));
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/monitors/")) {
      const id = url.pathname.split("/").pop();
      const body = await readBody(req);
      return sendJson(res, 200, decorateState(updateMonitor(id, body)));
    }

    if (req.method === "POST" && url.pathname === "/api/scopes") {
      const body = await readBody(req);
      return sendJson(res, 201, decorateState(createScope(body.scope, body.intervalMinutes)));
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/monitors/")) {
      const id = url.pathname.split("/").pop();
      return sendJson(res, 200, decorateState(removeEntity("monitor", id)));
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/scopes/")) {
      const id = url.pathname.split("/").pop();
      return sendJson(res, 200, decorateState(removeEntity("scope", id)));
    }

    if (req.method === "POST" && url.pathname === "/api/refresh") {
      const body = await readBody(req);
      const report = await runDueJobs({ force: true, target: body.target || "all" });
      return sendJson(res, 200, { report, state: decorateState(readState()) });
    }

    sendJson(res, 404, { error: "API not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, () => {
  startScheduler();
  const ai = getAiConfig();
  console.log(`AIHot is running at http://localhost:${port}`);
  console.log(`${ai.providerLabel}: ${ai.configured ? `configured (${ai.model})` : `not configured (${ai.keyEnv}), local fallback enabled`}`);
});
