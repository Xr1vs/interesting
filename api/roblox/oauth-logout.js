const { parseCookies, clearCookie } = require("../../lib/cookies");
const { deleteSession } = require("../../lib/tokenStore");
const { SESSION_COOKIE } = require("../../lib/robloxSession");

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE];
  if (sessionId) await deleteSession(sessionId);
  clearCookie(res, SESSION_COOKIE);
  res.status(200).json({ ok: true });
};
