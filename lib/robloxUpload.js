// Uploads one audio file to Roblox via the Open Cloud Assets API and polls
// until the asset finishes processing, returning the resulting asset id.
//
// Docs: https://create.roblox.com/docs/cloud/reference/Asset
//
// Two auth modes are supported:
//  - OAuth (preferred): pass accessToken + creatorId (the connected user's
//    Roblox id, from the OAuth session) — this is what the "Connect with
//    Roblox" flow in Settings uses, per-user, nothing pasted by hand.
//  - Legacy API key: pass apiKey + creatorType + creatorId — kept for
//    deployments that configure a single shared ROBLOX_API_KEY server-side
//    for everyone to use, without anyone connecting their own account.
//
// This runs server-side only — credentials are used for a single
// request/poll cycle and are never persisted in this file.

// If the caller didn't supply an API key (browser field left blank / not
// using the legacy path), fall back to a server-side environment variable.
function resolveApiKeyCreds({ apiKey, creatorType, creatorId }) {
  return {
    apiKey: apiKey || process.env.ROBLOX_API_KEY,
    creatorType: creatorType || process.env.ROBLOX_CREATOR_TYPE || "User",
    creatorId: creatorId || process.env.ROBLOX_CREATOR_ID,
  };
}

function authHeaderFor({ accessToken, apiKey }) {
  if (accessToken) return { Authorization: `Bearer ${accessToken}` };
  return { "x-api-key": apiKey };
}

async function uploadToRoblox(args) {
  const { fileBuffer, fileName, displayName, accessToken } = args;

  let creator, authHeader;
  if (accessToken) {
    // OAuth path — creatorId is always the connected user's own id here
    // (group uploads via OAuth would need the user to grant the app access
    // to a specific group during consent; not wired up yet).
    if (!args.creatorId) throw new Error("Missing Roblox user id for the connected OAuth session.");
    creator = { userId: String(args.creatorId) };
    authHeader = authHeaderFor({ accessToken });
  } else {
    const { apiKey, creatorType, creatorId } = resolveApiKeyCreds(args);
    if (!apiKey) {
      throw new Error(
        "Not connected to Roblox — click \"Connect with Roblox\" in Settings (or ask whoever deployed this to set a shared ROBLOX_API_KEY)."
      );
    }
    if (!creatorId) throw new Error("Missing Roblox creator id (set it in Settings, or as the ROBLOX_CREATOR_ID env var on your host)");
    creator = creatorType === "Group" ? { groupId: String(creatorId) } : { userId: String(creatorId) };
    authHeader = authHeaderFor({ apiKey });
  }

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
    headers: authHeader,
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
    if (createRes.status === 401 && !accessToken) {
      throw new Error(
        (createJson.message || "Roblox rejected the API key (401 Unauthorized).") +
        " Most likely cause: the key's IP restriction (create.roblox.com/credentials -> your key -> " +
        "\"Restrict by IP\") isn't set to \"Any IP\" — Vercel/Railway don't have a fixed outbound IP, so a " +
        "locked-down key will 401 in production even if it works when you test it locally. Other causes: " +
        "the key is missing the Assets:Write operation, it's expired, or the Creator Type/ID in Settings " +
        "doesn't match the user/group the key was created for."
      );
    }
    if (createRes.status === 401 && accessToken) {
      throw new Error(
        (createJson.message || "Roblox rejected the connection (401 Unauthorized).") +
        " Your Roblox connection may have expired or been revoked — try disconnecting and reconnecting in Settings."
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
      headers: authHeader,
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
