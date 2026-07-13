# Audio Prep Console

A browser-based tool for prepping audio for Roblox: pitch-shifts audio down,
runs it through a noise-reduction / limiter chain, and splits it into timed
chunks. Everything runs client-side in the browser via `ffmpeg-wasm` — no
server, no upload, no build step.

## Run locally

Just open `index.html` in a browser. No install needed.

Or, to serve it properly (recommended, since some browsers restrict
module scripts on `file://` URLs):

```bash
npx serve .
```

## Deploy

### Vercel

1. Push this repo to GitHub.
2. In Vercel, "Add New Project" → import the repo.
3. Framework preset: **Other** / static. No build command needed — it'll
   just serve `index.html`.

### Railway

1. Push this repo to GitHub.
2. In Railway, "New Project" → "Deploy from GitHub repo".
3. Railway will detect `package.json` and run `npm start`, which serves
   the static files on the assigned `$PORT`.

## Roblox player

`roblox/AudioPrepPlayer.lua` is a companion LocalScript for playing back
the processed chunks in Roblox with the correct playback speed. Drop it
in `StarterPlayer > StarterPlayerScripts` and fill in your own uploaded
`rbxassetid`s in the `TRACKS` table at the top of the file.

## Notes

- All processing (pitch shift, noise reduction, limiting, splitting)
  happens locally in your browser tab — files never leave your device.
- The QC pass is a lightweight peak/clip check; the desktop version's
  full 3-pass static-burst scan was left out to keep browser processing
  fast.
