const { makePkce, newState, buildAuthUrl } = require("../../lib/robloxOAuth");
const { setCookie } = require("../../lib/cookies");

// Where Roblox redirects back to after the user approves/denies access.
// Must exactly match a Redirect URI registered on the OAuth app in the
// Roblox Creator Dashboard. Override with APP_BASE_URL if your public URL
// differs from what the request's Host header shows (e.g. behind a proxy).
function redirectUriFor(req) {
  if (process.env.APP_BASE_URL) return `${process.env.APP_BASE_URL}/api/roblox/oauth-callback`;
  const host = req.headers.host || "";
  const proto =
    req.headers["x-forwarded-proto"] ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}/api/roblox/oauth-callback`;
}

module.exports = async function handler(req, res) {
  try {
    const { verifier, challenge } = makePkce();
    const state = newState();
    const redirectUri = redirectUriFor(req);

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
