# Audio Prep Console

A browser-based tool for prepping audio for Roblox: pitch-shifts audio down,
runs it through a noise-reduction / limiter chain, splits it into timed
chunks, and can optionally upload the results straight to Roblox and hand
you back the asset IDs.

All audio processing runs client-side in the browser via `ffmpeg-wasm` —
your files never leave your device unless you explicitly click "Upload to
Roblox." The small server (`server.js` / `api/roblox/upload.js`) only
exists to relay that one upload request to Roblox's Open Cloud API, since
Roblox's API can't be called directly from a browser.

## Before you deploy

**1. Set your own password.**
The lock screen checks a SHA-256 hash, not a plaintext password. Open
`index.html`, find `CONFIG.passwordHash` near the top of the `<script>`
block, and replace it with the hash of your own password. Generate one
in any browser console:

```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword'))
  .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
```

The default password is `changeme` — don't ship that.

This is a simple front-door lock (keeps casual visitors out), not real
access control. If you need stronger protection, also enable your host's
own auth — e.g. Vercel's built-in password protection.

**2. Get a Roblox Open Cloud API key** (only needed for auto-upload).
Go to `create.roblox.com/credentials`, create a key with the **Assets ·
Write** permission scoped to your user or group. You'll paste this into
the app's Settings tab at runtime — it's stored in your browser's
`localStorage` and sent only to your own `/api/roblox/upload` endpoint.

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Deploy

### Vercel

1. Push this repo to GitHub, import it in Vercel.
2. No config needed — `index.html` is served statically, and
   `api/roblox/upload.js` is automatically picked up as a serverless
   function.

### Railway

1. Push this repo to GitHub, deploy from it in Railway.
2. Railway detects `package.json` and runs `npm start`, which boots
   `server.js` — this serves the static site **and** the
   `/api/roblox/upload` route on the assigned `$PORT`.

## Roblox player

`roblox/AudioPrepPlayer.lua` is a companion LocalScript for playing back
the processed chunks in Roblox with the correct playback speed. Drop it
in `StarterPlayer > StarterPlayerScripts`. After you upload chunks from
the Settings-linked Roblox account, the app prints ready-to-paste asset
ID lines in the log — copy those into the `TRACKS` table at the top of
the script.

## Notes

- The QC pass is a lightweight peak/clip check; the desktop version's
  full 3-pass static-burst scan was left out to keep browser processing
  fast.
- Uploaded audio still goes through Roblox's normal moderation review
  before it's usable in-experience — the asset ID comes back as soon as
  Roblox finishes processing the upload, which is separate from
  moderation approval.
