const { exchangeCode, getUserInfo } = require("../../lib/robloxOAuth");
const { setSession } = require("../../lib/tokenStore");
const { parseCookies, setCookie, clearCookie } = require("../../lib/cookies");
const { SESSION_COOKIE, newSessionId } = require("../../lib/robloxSession");

function sendHtmlRedirect(res, location, message) {
  // A real redirect (not just Location header) so this also degrades
  // gracefully if something in front of the app strips 3xx responses.
  res.setHeader("Content-Type", "text/html");
  res.status(200).end(
    `<!doctype html><meta http-equiv="refresh" content="0;url=${location}">` +
      `<body style="font-family:sans-serif;background:#111;color:#eee;padding:40px;">` +
      `<p>${message}</p><p><a href="${location}" style="color:#9cf;">Continue</a></p></body>`
  );
}

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req);
  const pendingRaw = cookies["xr_oauth_pending"];
  clearCookie(res, "xr_oauth_pending");

  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const { code, state, error, error_description } = query;

  if (error) {
    return sendHtmlRedirect(res, "/?rbx_error=" + encodeURIComponent(error_description || error), "Roblox login was cancelled or denied.");
  }

  let pending;
  try {
    pending = JSON.parse(pendingRaw || "null");
  } catch {
    pending = null;
  }
  if (!pending || !state || state !== pending.state) {
    return sendHtmlRedirect(res, "/?rbx_error=" + encodeURIComponent("Login session expired or invalid — please try connecting again."), "Login session expired — please try again.");
  }

  try {
    const tokens = await exchangeCode({ code, redirectUri: pending.redirectUri, codeVerifier: pending.verifier });
    const profile = await getUserInfo(tokens.access_token);

    const sessionId = newSessionId();
    await setSession(sessionId, {
      userId: profile.sub,
      displayName: profile.preferred_username || profile.name || profile.sub,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    setCookie(res, SESSION_COOKIE, sessionId, { maxAgeSeconds: 60 * 60 * 24 * 60 });
    sendHtmlRedirect(res, "/?connected=1", "Connected — you can close this and return to the app.");
  } catch (err) {
    sendHtmlRedirect(res, "/?rbx_error=" + encodeURIComponent(err.message || "Login failed"), "Roblox login failed: " + (err.message || "unknown error"));
  }
};
