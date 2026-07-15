// Grants other Roblox accounts permission to *use* audio assets that were
// uploaded here — the actual Roblox "asset permissions" system, distinct
// from the in-experience Show-Control Whitelist. This is what you want when
// an audio was uploaded from an alt account but a different (often your
// main) account needs to be able to use it in a game.
//
// Docs: https://create.roblox.com/docs/cloud/reference/features/assets
//       (PATCH /asset-permissions-api/v1/assets/permissions)
//
// Same two auth modes as uploads: OAuth session (Bearer token) or a legacy
// API key. Either way, the key/token must belong to (or have access to
// manage) the account that currently owns the asset — you can't grant
// permission on an asset you don't have write access to.

function authHeaderFor({ accessToken, apiKey }) {
  if (accessToken) return { Authorization: `Bearer ${accessToken}` };
  return { "x-api-key": apiKey };
}

// Roblox's public username -> userId lookup. No auth required; this is the
// same endpoint the website itself uses for profile links.
async function resolveUserIdsByUsername(usernames) {
  const unique = [...new Set(usernames.map((u) => String(u).trim()).filter(Boolean))];
  if (unique.length === 0) return {};

  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: unique, excludeBannedUsers: false }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new Error(`Roblox username lookup failed (${res.status})`);
  }

  const found = new Map((json.data || []).map((u) => [u.requestedUsername.toLowerCase(), u]));
  const result = {};
  for (const name of unique) {
    const hit = found.get(name.toLowerCase());
    result[name] = hit ? { userId: hit.id, name: hit.name } : null; // null = not found / typo
  }
  return result;
}

// Grants "Use" permission (lets the subject use the asset inside their own
// experiences) on one or more asset ids to a single Roblox user.
async function grantAudioUsePermission({ assetIds, subjectUserId, accessToken, apiKey }) {
  if (!assetIds || assetIds.length === 0) throw new Error("No asset ids provided to grant permission for.");
  if (!subjectUserId) throw new Error("Missing the Roblox user id to grant permission to.");

  const body = {
    subjectType: "User",
    subjectId: String(subjectUserId),
    action: "Use",
    requests: assetIds.map((id) => ({ assetId: String(id) })),
  };

  const res = await fetch("https://apis.roblox.com/asset-permissions-api/v1/assets/permissions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaderFor({ accessToken, apiKey }) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = (json && (json.message || json.errorMessage)) || `Roblox rejected the permission grant (${res.status})`;
    if (res.status === 403) {
      throw new Error(
        `${msg} — the API key/connection needs the "asset-permissions:write" scope, and it must belong to ` +
        `whichever account currently owns these audio assets.`
      );
    }
    throw new Error(msg);
  }

  return {
    grantedAssetIds: (json && json.successAssetIds) || [],
    errors: (json && json.errors) || [],
  };
}

module.exports = { resolveUserIdsByUsername, grantAudioUsePermission };
