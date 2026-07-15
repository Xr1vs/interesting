const { parseCookies } = require("../../lib/cookies");
const { SESSION_COOKIE, getValidAccessToken } = require("../../lib/robloxSession");

module.exports = async function handler(req, res) {
  try {
    const cookies = parseCookies(req);
    const sessionId = cookies[SESSION_COOKIE];
    const session = sessionId ? await getValidAccessToken(sessionId) : null;

    res.status(200).json({
      connected: Boolean(session),
      userId: session ? session.userId : null,
      displayName: session ? session.displayName : null,
      avatarUrl: session ? session.avatarUrl : null,
      hasServerKey: Boolean(process.env.ROBLOX_API_KEY), // legacy shared-key fallback, see Settings
    });
  } catch (err) {
    res.status(200).json({ connected: false, error: err.message });
  }
};
