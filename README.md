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

## GPS minimap (`/minimap/`)

A separate page that turns real-world navigation into a game-style minimap: http://localhost:5173/minimap/ in dev,
`<site>/minimap/` once deployed.

- Type a destination (and optionally a start; blank means GPS), or click the map to drop a waypoint.
- `Space` simulates driving the route, `[` `]` change drive speed, `Tab` switches to an alternative route,
  `Esc` clears the waypoint, mouse wheel zooms.
- With real GPS (phone, HTTPS) the player follows your position, the route trims as you drive and reroutes if you leave it.

Map data © OpenStreetMap contributors via OpenFreeMap (no API key), routing by the public OSRM server,
search by Photon. Map style: `minimap/mapStyle.js`; navigation and HUD: `minimap/main.js`.

## iOS app (`ios/`)

**Minimap Nav**: the back camera fills the screen and the minimap sits bottom-left as a HUD; the record button
captures the screen (camera + HUD + mic) and saves the clip to Photos.

- Open `ios/MinimapNav.xcodeproj` in Xcode, pick your iPhone and press Run (iOS 17+).
- Tap the minimap to search for a waypoint, choose between alternative routes, start a demo drive or clear the waypoint.
- The map style is shared with the web minimap: after changing `minimap/mapStyle.js`, run `node ios/tools/export-style.mjs`.

## Road to a Billion (`/billion/`)

A GTA V story-mode checklist: every story mission in order, plus when to do (or skip) Lester's assassinations and which stock to buy before and after each one.
Tick a mission off (or press **Mark mission complete**) and the next one comes up. Progress and your optional real
bank total are saved in the browser. Steps and stock tips live in the `STEPS` array in `billion/main.js`.

## OBS HUD overlay

A GTA-style HUD for streamers: health and special bars, wanted stars, money, police
lights and a minimap. It's at `obs/`. Each streamer opens `obs/control.html` once. The
page makes them a private room code and shows two links to paste into OBS: a
**Browser source** (the overlay, 1920 × 1080) and a **Custom Browser Dock** (the
controls, which viewers never see). The dock and overlay sync through a small relay,
and different streamers' rooms never mix.

- **While developing:** `npm run dev` includes a local relay, so it works with no setup.
- **When hosted:** the relay is the Cloudflare Worker in `relay/`. Deploy it once:

  ```bash
  cd relay
  npx wrangler login
  npx wrangler deploy
  ```

  Then set the repo variable `HUD_RELAY_URL` to the worker's address, using `wss://`
  rather than `https://`. For example, `wss://hud-overlay-relay.<you>.workers.dev`.
  The next GitHub Pages build picks it up.
