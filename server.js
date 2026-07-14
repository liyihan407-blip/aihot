const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./src/env");
const { getAiConfig } = require("./src/ai");
const { collectSources } = require("./src/sources");
const {
  createMonitor,
  createScope,
  decorateState,
  removeEntity,
  removeWatchTerm,
  runDueJobs,
  saveKeyword,
  saveWatchTerm,
  startScheduler,
  subscribeJobEvents,
  updateMonitor,
  updateWatchTerm
} = require("./src/jobs");
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

const wsClients = new Set();

function wsFrame(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = [];
  header.push(0x81);
  if (body.length < 126) {
    header.push(body.length);
  } else if (body.length < 65536) {
    header.push(126, (body.length >> 8) & 255, body.length & 255);
  } else {
    header.push(127, 0, 0, 0, 0, (body.length >> 24) & 255, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255);
  }
  return Buffer.concat([Buffer.from(header), body]);
}

function sendWs(socket, payload) {
  if (socket.destroyed) return;
  socket.write(wsFrame(payload));
}

function broadcast(payload) {
  for (const socket of wsClients) {
    sendWs(socket, payload);
  }
}

function handleUpgrade(req, socket) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  wsClients.add(socket);
  sendWs(socket, { type: "connected", title: "实时通知已连接", createdAt: new Date().toISOString() });
  socket.on("close", () => wsClients.delete(socket));
  socket.on("error", () => wsClients.delete(socket));
}

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

    if (req.method === "GET" && url.pathname === "/api/watch-terms") {
      const state = decorateState(readState());
      return sendJson(res, 200, { terms: state.monitors });
    }

    if (req.method === "POST" && url.pathname === "/api/watch-terms") {
      const body = await readBody(req);
      return sendJson(res, 201, decorateState(saveWatchTerm(body.term || body.keyword, {
        intervalMinutes: body.intervalMinutes,
        enabled: body.enabled
      })));
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/watch-terms/")) {
      const id = url.pathname.split("/").pop();
      const body = await readBody(req);
      return sendJson(res, 200, decorateState(updateWatchTerm(id, body)));
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/watch-terms/")) {
      const id = url.pathname.split("/").pop();
      return sendJson(res, 200, decorateState(removeWatchTerm(id)));
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

    if (req.method === "POST" && url.pathname === "/api/search") {
      const body = await readBody(req);
      const query = String(body.query || "").trim();
      if (!query) return sendJson(res, 400, { error: "Search query is required." });
      const result = await collectSources(query);
      return sendJson(res, 200, {
        query,
        searchedAt: new Date().toISOString(),
        items: result.items,
        errors: result.errors
      });
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

server.on("upgrade", handleUpgrade);

subscribeJobEvents((event) => {
  broadcast(event);
});

server.listen(port, () => {
  startScheduler();
  const ai = getAiConfig();
  console.log(`AIHot is running at http://localhost:${port}`);
  console.log(`${ai.providerLabel}: ${ai.configured ? `configured (${ai.model})` : `not configured (${ai.keyEnv}), local fallback enabled`}`);
});
