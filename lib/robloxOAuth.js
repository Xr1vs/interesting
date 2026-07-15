// Roblox Open Cloud OAuth 2.0 (Authorization Code + PKCE).
// Docs: https://create.roblox.com/docs/cloud/auth/oauth2-overview
//
// The client secret is read from an environment variable ONLY and is used
// exclusively in server-side requests to Roblox's token endpoint. It is
// never sent to, or reachable from, the browser.

const crypto = require("crypto");

const CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;

const AUTH_URL = "https://apis.roblox.com/oauth/v1/authorize";
const TOKEN_URL = "https://apis.roblox.com/oauth/v1/token";
const USERINFO_URL = "https://apis.roblox.com/oauth/v1/userinfo";

// openid+profile so we can identify who's connected; asset:read+asset:write
// so the token can be used with the Assets API in place of an API key.
const SCOPES = "openid profile asset:read asset:write";

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function newState() {
  return base64url(crypto.randomBytes(16));
}

function buildAuthUrl({ redirectUri, state, codeChallenge }) {
  if (!CLIENT_ID) throw new Error("ROBLOX_CLIENT_ID is not configured on the server.");
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_type: "code",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompts: "login consent",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function basicAuthHeader() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("ROBLOX_CLIENT_ID / ROBLOX_CLIENT_SECRET are not configured on the server.");
  }
  return "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
}

async function postToken(bodyParams) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: bodyParams.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error_description || json.error || `Roblox token request failed (${res.status})`);
  }
  return json; // { access_token, refresh_token, id_token, expires_in, token_type, scope }
}

// codeVerifier is the PKCE secret generated at login time and handed back to
// us via a short-lived cookie — never persisted anywhere.
function exchangeCode({ code, redirectUri, codeVerifier }) {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    })
  );
}

function refreshAccessToken(refreshToken) {
  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );
}

async function getUserInfo(accessToken) {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Failed to fetch Roblox account info (${res.status})`);
  return res.json(); // { sub, name, preferred_username, ... }
}

module.exports = {
  CLIENT_ID,
  makePkce,
  newState,
  buildAuthUrl,
  exchangeCode,
  refreshAccessToken,
  getUserInfo,
};
