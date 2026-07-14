const { makePkce, newState, buildAuthUrl } = require("../../lib/robloxOAuth");
const { setCookie } = require("../../lib/cookies");

// Where Roblox redirects back to after the user approves/denies access.
// Must exactly match a Redirect URI registered on the OAuth app in the
// Roblox Creator Dashboard. Override with APP_BASE_URL if your public URL
// differs from what the request's Host header shows (e.g. behind a proxy).
function redirectUriFor(req) {
  if (process.env.APP_BASE_URL) {
    const base = process.env.APP_BASE_URL.trim().replace(/\/+$/, "");
    return `${base}/api/roblox/oauth-callback`;
  }
  const host = req.headers.host || "";
  const proto =
    req.headers["x-forwarded-proto"] ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}/api/roblox/oauth-callback`;
}

module.exports = async function handler(req, res) {
  try {
    const redirectUri = redirectUriFor(req);

    // Visit /api/roblox/oauth-login?debug=1 to see the exact redirect_uri
    // this deployment sends to Roblox, without actually starting the OAuth
    // flow. Paste it into "Redirect URIs" on the Roblox Creator Dashboard
    // (create.roblox.com/dashboard/credentials) — it must match character
    // for character (scheme, host, no/with trailing slash, path) or Roblox
    // will reject it with "Redirect URI is invalid for this application."
    if (req.query?.debug || (req.url || "").includes("debug=1")) {
      return res.status(200).json({ redirectUri, appBaseUrlEnv: process.env.APP_BASE_URL || null });
    }

    const { verifier, challenge } = makePkce();
    const state = newState();

    // Short-lived (10 min), httpOnly cookie holding just enough to validate
    // the callback — never touches the browser's JS, never persisted.
    setCookie(res, "xr_oauth_pending", JSON.stringify({ state, verifier, redirectUri }), {
      maxAgeSeconds: 600,
    });

    const url = buildAuthUrl({ redirectUri, state, codeChallenge: challenge });
    res.writeHead(302, { Location: url });
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message || "Could not start Roblox login" });
  }
};
