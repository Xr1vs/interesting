const express = require("express");
const multer = require("multer");
const path = require("path");
const { uploadToRoblox } = require("./lib/robloxUpload");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.post("/api/roblox/upload", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file provided" });
    const { displayName, apiKey, creatorType, creatorId } = req.body;

    const assetId = await uploadToRoblox({
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      displayName,
      apiKey,
      creatorType,
      creatorId,
    });

    res.json({ assetId });
  } catch (err) {
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

app.listen(PORT, () => console.log(`Audio Prep Console listening on :${PORT}`));
