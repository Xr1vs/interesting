const express = require("express");
const multer = require("multer");
const path = require("path");
const { uploadToRoblox } = require("./lib/robloxUpload");
const { parseCookies } = require("./lib/cookies");
const { SESSION_COOKIE, getValidAccessToken } = require("./lib/robloxSession");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

// OAuth handlers are plain (req,res) functions written once and shared
// as-is between this Express server and the Vercel serverless deployment —
// both runtimes expose the same req.headers / res.status().json() surface,
// so no adapter is needed.
app.get("/api/roblox/oauth-login", (req, res) => require("./api/roblox/oauth-login")(req, res));
app.get("/api/roblox/oauth-callback", (req, res) => require("./api/roblox/oauth-callback")(req, res));
app.get("/api/roblox/oauth-status", (req, res) => require("./api/roblox/oauth-status")(req, res));
app.post("/api/roblox/oauth-logout", (req, res) => require("./api/roblox/oauth-logout")(req, res));

app.get("/api/roblox/keystatus", (req, res) => {
  res.json({
    hasServerKey: Boolean(process.env.ROBLOX_API_KEY),
    creatorType: process.env.ROBLOX_CREATOR_TYPE || null,
    hasCreatorId: Boolean(process.env.ROBLOX_CREATOR_ID),
  });
});

app.get("/api/roblox/testkey", async (req, res) => {
  try {
    const apiKey = req.query.apiKey || process.env.ROBLOX_API_KEY;
    const creatorType = req.query.creatorType || process.env.ROBLOX_CREATOR_TYPE || "User";
    const creatorId = req.query.creatorId || process.env.ROBLOX_CREATOR_ID;
    if (!apiKey) return res.json({ ok: false, reason: "No API key provided or configured server-side." });
    if (!creatorId) return res.json({ ok: false, reason: "No creator id provided or configured server-side." });
    const url =
      creatorType === "Group"
        ? `https://apis.roblox.com/cloud/v2/groups/${creatorId}`
        : `https://apis.roblox.com/cloud/v2/users/${creatorId}`;
    const rbxRes = await fetch(url, { headers: { "x-api-key": apiKey } });
    const text = await rbxRes.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    res.json({
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
    res.json({ ok: false, reason: `Request to Roblox failed: ${err.message}` });
  }
});


app.post("/api/roblox/upload", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file provided" });
    const { displayName, apiKey, creatorType, creatorId } = req.body;

    // Preferred path: the browser's session cookie maps to a connected
    // Roblox OAuth account. Falls back to a manually-supplied/legacy
    // server-configured API key if no session is connected.
    const cookies = parseCookies(req);
    const session = await getValidAccessToken(cookies[SESSION_COOKIE]);

    const assetId = await uploadToRoblox({
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      displayName,
      accessToken: session ? session.accessToken : undefined,
      creatorId: session ? session.userId : creatorId,
      apiKey: session ? undefined : apiKey,
      creatorType: session ? undefined : creatorType,
    });

    res.json({ assetId });
  } catch (err) {
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

app.listen(PORT, () => console.log(`Audio Prep Console listening on :${PORT}`));
