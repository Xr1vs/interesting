// Uploads one audio file to Roblox via the Open Cloud Assets API and polls
// until the asset finishes processing, returning the resulting asset id.
//
// Docs: https://create.roblox.com/docs/cloud/reference/Asset
//
// This runs server-side only — the caller's API key is used for a single
// request/poll cycle and is never persisted here.

// If the caller didn't supply credentials (browser fields left blank), fall
// back to server-side environment variables. This lets you configure the key
// once in your host's dashboard (Vercel/Railway "Environment Variables") and
// never touch it in the browser again.
function resolveCreds({ apiKey, creatorType, creatorId }) {
  return {
    apiKey: apiKey || process.env.ROBLOX_API_KEY,
    creatorType: creatorType || process.env.ROBLOX_CREATOR_TYPE || "User",
    creatorId: creatorId || process.env.ROBLOX_CREATOR_ID,
  };
}

async function uploadToRoblox(args) {
  const { fileBuffer, fileName, displayName } = args;
  const { apiKey, creatorType, creatorId } = resolveCreds(args);
  if (!apiKey) throw new Error("Missing Roblox API key (set it in Settings, or as the ROBLOX_API_KEY env var on your host)");
  if (!creatorId) throw new Error("Missing Roblox creator id (set it in Settings, or as the ROBLOX_CREATOR_ID env var on your host)");

  const creator =
    creatorType === "Group" ? { groupId: String(creatorId) } : { userId: String(creatorId) };

  const requestPayload = {
    assetType: "Audio",
    displayName: displayName || fileName,
    description: "Uploaded via Audio Prep Console",
    creationContext: { creator },
  };

  const form = new FormData();
  form.append("request", JSON.stringify(requestPayload));
  form.append("fileContent", new Blob([fileBuffer]), fileName);

  const createRes = await fetch("https://apis.roblox.com/assets/v1/assets", {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  });

  const createText = await createRes.text();
  let createJson;
  try {
    createJson = JSON.parse(createText);
  } catch {
    throw new Error(`Roblox upload failed (${createRes.status}): ${createText.slice(0, 300)}`);
  }
  if (!createRes.ok) {
    if (createRes.status === 401) {
      throw new Error(
        (createJson.message || "Roblox rejected the API key (401 Unauthorized).") +
        " Most likely cause: the key's IP restriction (create.roblox.com/credentials -> your key -> " +
        "\"Restrict by IP\") isn't set to \"Any IP\" — Vercel/Railway don't have a fixed outbound IP, so a " +
        "locked-down key will 401 in production even if it works when you test it locally. Other causes: " +
        "the key is missing the Assets:Write operation, it's expired, or the Creator Type/ID in Settings " +
        "doesn't match the user/group the key was created for."
      );
    }
    throw new Error(createJson.message || `Roblox upload failed (${createRes.status})`);
  }

  const operationPath = createJson.path; // e.g. "operations/abc123"
  if (!operationPath) throw new Error("Roblox did not return an operation to track");

  // Poll the operation until it's done (asset created + queued for moderation).
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const pollRes = await fetch(`https://apis.roblox.com/assets/v1/${operationPath}`, {
      headers: { "x-api-key": apiKey },
    });
    const pollJson = await pollRes.json();
    if (pollJson.done) {
      const assetId = pollJson.response && pollJson.response.assetId;
      if (!assetId) throw new Error("Roblox finished processing but returned no asset id");
      return assetId;
    }
  }
  throw new Error("Timed out waiting for Roblox to finish processing the asset");
}

module.exports = { uploadToRoblox };
