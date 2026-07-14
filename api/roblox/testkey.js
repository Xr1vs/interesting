// Read-only diagnostic: confirms whether your API key + creator id actually
// authenticate with Roblox, without uploading anything. Same auth path as
// the real upload, so if this works, uploads should too (and if this fails,
// we get Roblox's exact reason instead of guessing).
module.exports = async function handler(req, res) {
  try {
    const apiKey = req.query.apiKey || process.env.ROBLOX_API_KEY;
    const creatorType = req.query.creatorType || process.env.ROBLOX_CREATOR_TYPE || "User";
    const creatorId = req.query.creatorId || process.env.ROBLOX_CREATOR_ID;

    if (!apiKey) return res.status(200).json({ ok: false, reason: "No API key provided or configured server-side." });
    if (!creatorId) return res.status(200).json({ ok: false, reason: "No creator id provided or configured server-side." });

    const url =
      creatorType === "Group"
        ? `https://apis.roblox.com/cloud/v2/groups/${creatorId}`
        : `https://apis.roblox.com/cloud/v2/users/${creatorId}`;

    const rbxRes = await fetch(url, { headers: { "x-api-key": apiKey } });
    const text = await rbxRes.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }

    res.status(200).json({
      ok: rbxRes.status < 300,
      robloxStatus: rbxRes.status,
      robloxBody: body,
      testedUrl: url,
      note:
        rbxRes.status === 401
          ? "This is the exact same auth Roblox rejects on upload too — it's a key/permissions/IP-restriction issue, not a bug in this app."
          : rbxRes.status < 300
          ? "Key + creator id authenticate fine — if uploads still 401, the issue is specific to the Assets:Write scope not being granted on this key."
          : "Unexpected status — see robloxBody above for Roblox's exact message.",
    });
  } catch (err) {
    res.status(200).json({ ok: false, reason: `Request to Roblox failed: ${err.message}` });
  }
};
