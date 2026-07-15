const { parseCookies } = require("../../lib/cookies");
const { SESSION_COOKIE, getValidAccessToken } = require("../../lib/robloxSession");
const { resolveUserIdsByUsername, grantAudioUsePermission } = require("../../lib/robloxPermissions");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { usernames, assetIds, apiKey } = req.body || {};
    if (!Array.isArray(usernames) || usernames.length === 0) {
      res.status(400).json({ error: "No usernames provided." });
      return;
    }
    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      res.status(400).json({ error: "No asset ids to grant permission for." });
      return;
    }

    const cookies = parseCookies(req);
    const session = await getValidAccessToken(cookies[SESSION_COOKIE]);
    const accessToken = session ? session.accessToken : undefined;
    const resolvedApiKey = session ? undefined : apiKey || process.env.ROBLOX_API_KEY;

    if (!accessToken && !resolvedApiKey) {
      res.status(400).json({
        error: 'Not connected to Roblox — click "Connect with Roblox" in Settings first, or paste an API key.',
      });
      return;
    }

    const lookup = await resolveUserIdsByUsername(usernames);

    const results = {};
    for (const name of usernames) {
      const hit = lookup[name];
      if (!hit) {
        results[name] = { ok: false, error: "Username not found on Roblox — check the spelling." };
        continue;
      }
      try {
        const grant = await grantAudioUsePermission({
          assetIds,
          subjectUserId: hit.userId,
          accessToken,
          apiKey: resolvedApiKey,
        });
        results[name] = { ok: true, userId: hit.userId, resolvedName: hit.name, ...grant };
      } catch (err) {
        results[name] = { ok: false, error: err.message || "Grant failed" };
      }
    }

    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message || "Permission grant failed" });
  }
};
