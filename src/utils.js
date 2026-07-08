const crypto = require("crypto");

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function stripCdata(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim();
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function hashText(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  const direct = safeJsonParse(raw);
  if (direct) return direct;
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? safeJsonParse(match[0]) : null;
}

module.exports = {
  clampNumber,
  extractJsonObject,
  hashText,
  htmlDecode,
  normalizeText,
  nowIso,
  safeJsonParse,
  stripCdata,
  uid
};
