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

## Troubleshooting uploads

**"Upload failed: Roblox upload failed (401)"** — almost always the API key's
**Restrict by IP** setting on `create.roblox.com/credentials`. Vercel and
Railway don't have a fixed outbound IP, so a key locked to a specific IP will
401 in production even though it works fine when you test from your own
machine. Set it to **Any IP**, and double check the key has **Assets · Write**
and that Creator Type/ID in Settings matches the user or group the key
belongs to.

**"Upload failed: Unexpected token 'R', "Request En"... is not valid JSON"**
— this was a real bug (fixed): Vercel's serverless functions hard-cap request
bodies around **4.5MB**, and reject anything bigger before your code even
runs, with a plain-text `Request Entity Too Large` body instead of JSON. Long
concert-set chunks routinely blow past that. The app now:
- shows a live **estimated size per chunk** next to the split-length field in
  the Process tab, and warns when a chunk is likely to hit the limit;
- fails with a clear message instead of crashing, if this happens.

If you're regularly processing long sets, the real fix is to deploy via
**Railway** instead of Vercel — `server.js` (Express) has no such cap. Vercel
is fine for song-length clips.

## Simpler credential setup (no cookie needed)

Roblox account cookies (`.ROBLOSECURITY`) aren't used here and shouldn't be —
they're full session tokens, using them for automation outside Roblox's own
client breaks Roblox's Terms of Service, and they're a common account-theft
vector if leaked. The supported alternative to re-pasting an Open Cloud API
key into the browser every time is **environment variables**: set
`ROBLOX_API_KEY`, `ROBLOX_CREATOR_TYPE`, and `ROBLOX_CREATOR_ID` in your
host's dashboard (Vercel → Project → Settings → Environment Variables;
Railway → Variables) and leave the Settings fields in the app blank — the
server fills them in automatically.

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

`roblox/XrAudioSystem.rbxm` is a prebuilt model with the client/server
scripts for a synced, multi-listener show player (play/pause commands
broadcast to everyone in the server, plus a `Whitelist` module gating
who can trigger a show). It's downloadable from the app's Settings tab,
or straight from `roblox/XrAudioSystem.rbxm` in this repo. Insert it in
Studio via **Insert from File**, then move its pieces into
`StarterPlayerScripts` / `ServerScriptService` as appropriate.

After processing a batch of tracks, name the show in the Output panel
and hit **Upload All & Build Show** — it uploads any tracks that aren't
uploaded yet, then downloads a `<Show Name>.rbxmx` folder of `Sound`
instances (asset IDs already filled in) ready to drop into
`XrAudio > Shows` (right-click **Shows** → **Insert from File**). Tracks
preload/play in the order they appear in that file; the `AudioServer`
script sorts by each Sound's `Tracknumber` attribute when one is set, so
add that in Studio if you need a different order than upload order.

## Notes

- The QC pass is a lightweight peak/clip check; the desktop version's
  full 3-pass static-burst scan was left out to keep browser processing
  fast.
- Uploaded audio still goes through Roblox's normal moderation review
  before it's usable in-experience — the asset ID comes back as soon as
  Roblox finishes processing the upload, which is separate from
  moderation approval.

## Roblox Assets tab (in-place .rbxm updates)

There's now a dedicated **Roblox Assets** tab (not buried in Settings) that:

- Renames the show folder inside `XrAudioSystem.rbxm` to whatever you type as the show name.
- Writes every track you've uploaded this session straight into the show's pre-built Sound
  slots (up to 58 tracks per show) — no manual "insert this rbxmx and delete the old one" step.
- Bakes the whitelist directly into the `Whitelist` module inside the same file.
- Gives you back **one updated `.rbxm`** to insert into Studio, same as always.

This *updates* the existing file's Name/SoundId/Source values in place rather than replacing
instances — it doesn't touch anything else in the model. It also fixes a real bug in the
bundled `Server` script: unused template slots used to get preloaded anyway (30s timeout wait
each), which is now skipped, and track order now falls back to alphabetical-by-name if no
`Tracknumber` attribute is set.

There's an optional **minify** toggle for the Server/Commands/AudioClient scripts (comment and
whitespace stripping). Worth knowing: Roblox doesn't support shipping scripts that are
encrypted-but-runnable — anyone with Studio access to a place can always read a Script's
Source there. The Server/Commands scripts already never reach players at all (they run with
`RunContext = Server`); only the client-side script is ever exposed to exploit tools, which is
what minification is actually protecting. The `Whitelist` module is always left readable since
you're meant to keep editing it in this tab.

## Universal / shared API key

If multiple people use the same deployment (anyone who knows the site's unlock password),
set `ROBLOX_API_KEY` / `ROBLOX_CREATOR_TYPE` / `ROBLOX_CREATOR_ID` as environment variables on
your host once. Everyone using that deployment then uploads through the same account
automatically — nobody else ever sees or needs the actual key. The Settings tab now shows a
live "server-side key detected" status so you can confirm it's working.

## No-API-key path: paste an asset ID manually

Each processed track now has a small "or paste asset ID" field next to it. If you'd rather not
deal with the Open Cloud API key at all, upload the file yourself through Roblox's own site
(create.roblox.com → Creator Dashboard → Creations → Audio → upload), copy the asset ID Roblox
shows you there, and paste it in. That track is now treated exactly the same as one uploaded
through the app — it flows into "Build & Download Updated .rbxm" normally. This needs no key,
no IP restriction, and no server credentials at all, since you're just using Roblox's own
website directly.

## Fixed: "file is corrupted" when inserting the built .rbxm into Studio

Real bug, now fixed: the builder was re-compressing *every* chunk in the file on rebuild — including
parts it never touched — through a hand-written LZ4 encoder. Any edge case that encoder got wrong
could corrupt chunks that had nothing to do with your edit. It now does two things instead:
unmodified chunks are copied byte-for-byte from the original file (never re-encoded at all), and
modified chunks are stored uncompressed (a completely valid, already-used-elsewhere-in-the-file
format) instead of being run through that encoder. Re-download and rebuild — the corrupted-file
issue should be gone.
