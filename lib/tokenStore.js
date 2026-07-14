// Stores each user's Roblox OAuth refresh/access tokens, keyed by an opaque
// session id (the browser only ever holds that id, in an httpOnly cookie —
// never the actual Roblox tokens).
//
// Production: set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (free
// tier at upstash.com — a REST-based Redis, so no extra SDK/native module is
// needed, which matters for Vercel's serverless functions). This is what
// makes "stay connected across visits" actually work in a stateless
// serverless deployment.
//
// Local/dev fallback: a JSON file on disk. Fine for `node server.js` locally
// or on a host with a persistent disk (Railway, etc.), but each Vercel
// serverless invocation can get a fresh filesystem, so this will NOT persist
// reliably there — it exists so the app still works out of the box without
// any extra setup while you're testing.

const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "..", ".oauth-sessions.json");
const hasUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

function readFileStore() {
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
  } catch {
    return {};
  }
}
function writeFileStore(obj) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error("[tokenStore] failed to write local session file:", e.message);
  }
}

async function upstashCmd(...cmd) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/${cmd.map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Upstash request failed (${res.status})`);
  const json = await res.json();
  return json.result;
}

async function getSession(sessionId) {
  if (!sessionId) return null;
  if (hasUpstash) {
    const raw = await upstashCmd("get", `xr_oauth:${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  }
  const store = readFileStore();
  return store[sessionId] || null;
}

async function setSession(sessionId, data) {
  if (hasUpstash) {
    // 60 day expiry on the stored session, refreshed each write.
    await upstashCmd("set", `xr_oauth:${sessionId}`, JSON.stringify(data), "EX", 60 * 60 * 24 * 60);
    return;
  }
  const store = readFileStore();
  store[sessionId] = data;
  writeFileStore(store);
}

async function deleteSession(sessionId) {
  if (!sessionId) return;
  if (hasUpstash) {
    await upstashCmd("del", `xr_oauth:${sessionId}`);
    return;
  }
  const store = readFileStore();
  delete store[sessionId];
  writeFileStore(store);
}

module.exports = { getSession, setSession, deleteSession, hasUpstash };
