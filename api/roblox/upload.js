const { uploadToRoblox } = require("../../lib/robloxUpload");
const { parseCookies } = require("../../lib/cookies");
const { SESSION_COOKIE, getValidAccessToken } = require("../../lib/robloxSession");

module.exports.config = {
  api: { bodyParser: false },
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // Vercel's Node runtime gives us a standard Request-like body; parse the
    // incoming multipart form using the platform's built-in Request/FormData.
    const request = new Request("http://internal/upload", {
      method: "POST",
      headers: req.headers,
      body: req,
      duplex: "half",
    });
    const form = await request.formData();

    const file = form.get("audio");
    const fileName = file && file.name ? file.name : "audio.ogg";
    const displayName = form.get("displayName") || fileName;

    if (!file) {
      res.status(400).json({ error: "No audio file provided" });
      return;
    }

    // Preferred path: the browser's session cookie maps to a connected
    // Roblox OAuth account. Falls back to a manually-supplied/legacy
    // server-configured API key if no session is connected.
    const cookies = parseCookies(req);
    const session = await getValidAccessToken(cookies[SESSION_COOKIE]);

    const arrayBuffer = await file.arrayBuffer();
    const assetId = await uploadToRoblox({
      fileBuffer: Buffer.from(arrayBuffer),
      fileName,
      displayName,
      accessToken: session ? session.accessToken : undefined,
      creatorId: session ? session.userId : form.get("creatorId"),
      apiKey: session ? undefined : form.get("apiKey"),
      creatorType: session ? undefined : form.get("creatorType") || "User",
    });

    res.status(200).json({ assetId });
  } catch (err) {
    res.status(500).json({ error: err.message || "Upload failed" });
  }
};
