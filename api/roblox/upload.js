const { uploadToRoblox } = require("../../lib/robloxUpload");

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
    const apiKey = form.get("apiKey");
    const creatorType = form.get("creatorType") || "User";
    const creatorId = form.get("creatorId");

    if (!file) {
      res.status(400).json({ error: "No audio file provided" });
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    const assetId = await uploadToRoblox({
      fileBuffer: Buffer.from(arrayBuffer),
      fileName,
      displayName,
      apiKey,
      creatorType,
      creatorId,
    });

    res.status(200).json({ assetId });
  } catch (err) {
    res.status(500).json({ error: err.message || "Upload failed" });
  }
};
