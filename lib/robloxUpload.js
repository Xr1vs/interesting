// Uploads one audio file to Roblox via the Open Cloud Assets API and polls
// until the asset finishes processing, returning the resulting asset id.
//
// Docs: https://create.roblox.com/docs/cloud/reference/Asset
//
// This runs server-side only — the caller's API key is used for a single
// request/poll cycle and is never persisted here.

async function uploadToRoblox({ fileBuffer, fileName, displayName, apiKey, creatorType, creatorId }) {
  if (!apiKey) throw new Error("Missing Roblox API key");
  if (!creatorId) throw new Error("Missing Roblox creator id");

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
