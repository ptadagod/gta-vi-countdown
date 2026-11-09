# GTA VI Countdown

An unofficial fan countdown for Grand Theft Auto VI, built with React + Vite.

**Live site:** https://ptadagod.github.io/gta-vi-countdown/

1. **PRE DOWNLOAD** counts down to 10 November 2026, 00:00 in the visitor's own timezone.
2. When it reaches zero: **"Pre Load Now Open"** shows for 5 seconds, then the launch trailer plays full screen (from 0:02, stopping at 1:27.5).
3. **LAUNCH** then counts down to 19 November 2026, 00:00 local time.
4. At zero, the **GTA VI LAUNCHED** screen appears.

## Run it

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

## Deploying

Every push to `main` builds and publishes the site to GitHub Pages automatically
(see `.github/workflows/deploy.yml`). Progress shows under the repo's **Actions** tab.

## Build for other hosts

```bash
npm run build
```

Upload the contents of the `dist/` folder to any static host (Netlify, Vercel, GitHub Pages, etc.).

## Test the transitions

Add `?time=` to the address to start the clock at a chosen local time:

- `?time=2026-11-09T23:59:56` – pre-load opens, then the trailer, then the LAUNCH timer
- `?time=2026-11-18T23:59:55` – the launch screen

A yellow badge shows while simulated time is on.

## Where things live

| What | File |
| --- | --- |
| Countdown dates | `src/lib/stages.js` |
| Background images (widescreen `GALLERY`, portrait `MOBILE_GALLERY` for upright phones/tablets) and logo | `src/lib/gallery.js` |
| Trailer video, start/stop times | `src/components/TrailerOverlay.jsx` |
| "Pre Load Now Open" duration | `ANNOUNCE_MS` in `src/App.jsx` |
| Background music (MP3 playlist) | files in `public/music/`, list in `PLAYLIST` in `src/lib/audio.js` |
| Styles | `src/index.css` |

Shortcuts: `B` / `←` `→` change background, `F` fullscreen, `M` music.

Images, logo and trailer are loaded from Rockstar Games and YouTube, so an internet connection is needed.
Grand Theft Auto VI and all related imagery are © Rockstar Games / Take-Two Interactive.
