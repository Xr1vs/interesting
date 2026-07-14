// Minimal cookie helpers — no dependency needed, and this works identically
// whether the handler is running under Express (server.js) or Vercel's Node
// runtime (api/roblox/*.js), since both expose the same raw req.headers.cookie
// / res.setHeader("Set-Cookie", ...) primitives.

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

// Appends a Set-Cookie header without clobbering any already set on this
// response (res.setHeader would otherwise overwrite a prior cookie).
function setCookie(res, name, value, { maxAgeSeconds, httpOnly = true, path = "/", sameSite = "Lax" } = {}) {
  let str = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) str += "; HttpOnly";
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) str += "; Secure";
  if (typeof maxAgeSeconds === "number") str += `; Max-Age=${maxAgeSeconds}`;
  const prev = res.getHeader && res.getHeader("Set-Cookie");
  const next = prev ? (Array.isArray(prev) ? [...prev, str] : [prev, str]) : [str];
  res.setHeader("Set-Cookie", next);
}

function clearCookie(res, name) {
  setCookie(res, name, "", { maxAgeSeconds: 0 });
}

module.exports = { parseCookies, setCookie, clearCookie };
