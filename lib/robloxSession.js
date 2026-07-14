// Ties a browser's opaque session cookie to a stored Roblox OAuth token set,
// refreshing the (short-lived, 15 minute) access token on demand.

const crypto = require("crypto");
const { getSession, setSession, deleteSession } = require("./tokenStore");
const { refreshAccessToken } = require("./robloxOAuth");

const SESSION_COOKIE = "xr_session";
const REFRESH_SKEW_MS = 60 * 1000; // refresh a bit before actual expiry

function newSessionId() {
  return crypto.randomBytes(24).toString("base64url");
}

// Returns { accessToken, userId, displayName } for a valid session, or null
// if there's no session / it could not be refreshed (e.g. revoked by the
// user on Roblox's side).
async function getValidAccessToken(sessionId) {
  const session = await getSession(sessionId);
  if (!session) return null;

  const isExpired = Date.now() >= session.expiresAt - REFRESH_SKEW_MS;
  if (!isExpired) {
    return { accessToken: session.accessToken, userId: session.userId, displayName: session.displayName };
  }

  try {
    const tokens = await refreshAccessToken(session.refreshToken);
    const updated = {
      ...session,
      accessToken: tokens.access_token,
      // Roblox may rotate the refresh token on use — always store whatever
      // comes back, falling back to the old one if it's omitted.
      refreshToken: tokens.refresh_token || session.refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };
    await setSession(sessionId, updated);
    return { accessToken: updated.accessToken, userId: updated.userId, displayName: updated.displayName };
  } catch (err) {
    // Refresh token is dead (revoked/expired) — drop the session so the
    // frontend cleanly falls back to "not connected" instead of erroring
    // forever on every upload.
    await deleteSession(sessionId);
    return null;
  }
}

module.exports = { SESSION_COOKIE, newSessionId, getValidAccessToken };
