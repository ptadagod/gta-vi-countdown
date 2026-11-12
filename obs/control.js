import { CLUES, MAX_STARS, load, newRoomCode, onStatus, relayUrl, room, save, subscribe, svg } from './shared.js'
import { bearing, haversine, searchPlaces } from '../minimap/geo.js'
import { fetchRoute, formatDistance, locate } from './nav.js'
import { ITEMS, WEAPONS, WHEEL, slotInfo, weaponKey } from './weapons.js'

// The control panel owns the game logic (blinking, evading, random reports, the special
// ability timer) so every overlay source shows the same thing.
let state = load()
const prefs = loadPrefs()
const $ = (s) => document.querySelector(s)

// Phone GPS (see the bottom of the file).
let gpsActive = false
let gpsWatch = null
let wakeLock = null
let lastFix = null // { pos, at }
let compass = null // degrees, from the phone's compass
let lastCompassSend = 0
let offRouteSince = 0
let rerouting = false

function set(patch) {
  state = { ...state, ...patch }
  save(state)
  show()
}

function raise(to) {
  const n = Math.min(Math.max(to, 2), MAX_STARS) // getting wanted starts you at 2 stars
  if (n <= state.stars) return
  set({ stars: n, raisedAt: Date.now(), evading: false })
  evadeFor = 0
}

// Fire rounds from the clip; an empty clip reloads by itself after a moment.
let reloading = 0
function shoot(n) {
  if (!WEAPONS[weaponKey(state.weapon)]?.mag || reloading) return
  set({ clip: Math.max(0, (state.clip ?? 0) - n) })
  if (state.clip === 0 && state.ammo > 0) reloading = setTimeout(() => { reloading = 0; reload() }, 1200)
}

function reload() {
  const w = WEAPONS[weaponKey(state.weapon)]
  if (!w) return
  const take = Math.min(w.mag - (state.clip ?? 0), state.ammo ?? 0)
  if (take > 0) set({ clip: state.clip + take, ammo: state.ammo - take })
}

// Switch weapon, keeping each gun's own clip and spare ammo.
function equip(kind) {
  const cur = weaponKey(state.weapon)
  if (kind === cur) return
  const ammoBy = { ...(state.ammoBy ?? {}) }
  if (WEAPONS[cur]) ammoBy[cur] = [state.clip ?? 0, state.ammo ?? 0]
  const next = WEAPONS[kind] ? (ammoBy[kind] ?? WEAPONS[kind].start) : null
  set({ weapon: kind, ammoBy, ...(next ? { clip: next[0], ammo: next[1] } : {}) })
}

// ---------- Weapon wheel ----------

// Dock grid cell for each wheel slot (3×3, centre is the label).
const CELL = [1, 2, 5, 8, 7, 6, 3, 0]
const wheel = () => ({ open: false, tab: 'weapons', focus: 2, ...(state.wheel ?? {}) })
function setWheel(patch) { set({ wheel: { ...wheel(), ...patch } }) }

/** Select a slot: weapons equip at once, items switch on or off. */
function pickSlot(i) {
  const w = wheel()
  const key = WHEEL[w.tab][i]
  setWheel({ focus: i })
  if (!key) return
  if (w.tab === 'weapons') equip(key === 'unarmed' ? 'none' : key)
  else if (key !== 'outfit') {
    const on = (state.wearing ?? []).includes(key)
    set({ wearing: on ? state.wearing.filter((x) => x !== key) : [...(state.wearing ?? []), key] })
  }
}

function showWheel() {
  const w = wheel()
  $('#wheelToggle').textContent = w.open ? 'Close wheel' : 'Open wheel'
  $('#wheelToggle').classList.toggle('on', w.open)
  document.querySelectorAll('[data-wheeltab]').forEach((b) => b.classList.toggle('on', b.dataset.wheeltab === w.tab))
  const cells = Array(9).fill('')
  WHEEL[w.tab].forEach((key, i) => {
    const info = slotInfo(w.tab, key)
    const active = w.tab === 'weapons'
      ? (key === 'unarmed' ? weaponKey(state.weapon) === 'none' : key === weaponKey(state.weapon))
      : (state.wearing ?? []).includes(key)
    cells[CELL[i]] = `<button class="slot${i === w.focus ? ' focus' : ''}${active ? ' active' : ''}" data-slot="${i}" title="${info.name}">
      ${info.icon ? `<img src="${info.icon}" alt="">` : '<span class="plus">+</span>'}</button>`
  })
  const f = slotInfo(w.tab, WHEEL[w.tab][w.focus])
  cells[4] = `<div class="wheel-name"><b>${f.name}</b><span>${f.group}</span></div>`
  $('#wheelGrid').innerHTML = cells.join('')
  $('#pillsOut').textContent = state.pills ?? 0
  $('#injectorsOut').textContent = state.injectors ?? 0
}

document.addEventListener('click', (e) => {
  const slot = e.target.closest('[data-slot]')
  if (slot) { pickSlot(+slot.dataset.slot); return }
  const tab = e.target.closest('[data-wheeltab]')
  if (tab) setWheel({ tab: tab.dataset.wheeltab, focus: tab.dataset.wheeltab === 'weapons' ? 2 : 2 })
})

// Arrow keys move around the wheel, Enter picks, Esc closes (while the dock has focus).
document.addEventListener('keydown', (e) => {
  if (!wheel().open || e.target.closest('input, select, textarea')) return
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
  if (step) { setWheel({ focus: (wheel().focus + step + 8) % 8 }); e.preventDefault() }
  else if (e.key === 'Enter') { pickSlot(wheel().focus); e.preventDefault() }
  else if (e.key === 'Escape') setWheel({ open: false })
})

function learn(clue) {
  if (!state.clues.includes(clue)) set({ clues: [...state.clues, clue] })
}

const labels = { witnesses: 'Witnesses', clothing: 'Clothing', face: 'Face', vehicle: 'Vehicle' }
$('#clues').innerHTML = CLUES.map((c) => `<button data-clue="${c}">${svg(c)}${labels[c]}</button>`).join('')

document.addEventListener('click', (e) => {
  const b = e.target.closest('button')
  if (!b) return
  if (b.dataset.clue) {
    const c = b.dataset.clue
    set({ clues: state.clues.includes(c) ? state.clues.filter((x) => x !== c) : [...state.clues, c] })
    return
  }
  switch (b.dataset.act) {
    case 'star': {
      raise(state.stars + 1)
      const unknown = CLUES.filter((c) => !state.clues.includes(c))
      if (unknown.length) learn(unknown[Math.floor(Math.random() * unknown.length)])
      break
    }
    case 'unstar':
      if (state.stars > 0) set({ stars: state.stars - 1, ...(state.stars === 1 ? { clues: [], evading: false } : {}) })
      break
    case 'evade':
      if (state.stars > 0) { set({ evading: !state.evading }); evadeFor = 0 }
      break
    case 'clear':
      set({ stars: 0, clues: [], evading: false, raisedAt: 0 })
      break
    case 'special':
      if (state.specialUntil > Date.now()) set({ specialUntil: 0 })
      else if (state.special > 0) set({ specialUntil: Date.now() + 15000 * state.special })
      break
    case 'drive': toggleDrive(); break
    case 'gps': gpsActive ? gpsStop() : gpsStart(); break
    case 'clearDest': setNav({ dest: null, destName: '', route: null, ...stopped() }); $('#destSearch').value = ''; break
    case 'shoot': shoot(1); break
    case 'burst': shoot(5); break
    case 'reload': reload(); break
    case 'ammo+': set({ ammo: (state.ammo ?? 0) + 100 }); break
    case 'wheel': setWheel({ open: !wheel().open }); break
    case 'pill':
      if ((state.pills ?? 0) > 0) set({ pills: state.pills - 1, health: Math.min(1, state.health + 0.5) })
      break
    case 'injector':
      if ((state.injectors ?? 0) > 0) set({ injectors: state.injectors - 1, special: 1 })
      break
    case 'restock': set({ pills: 2, injectors: 2 }); break
    case 'cash+100': set({ cash: state.cash + 100 }); break
    case 'cash+1000': set({ cash: state.cash + 1000 }); break
    case 'copy':
      copy(b.dataset.url ?? $(`#${b.dataset.target}`).textContent, b)
      break
    case 'newRoom':
      if (confirm('Make a new private code? Your current OBS links will stop working until you paste the new ones.')) {
        const url = new URL(location.href)
        url.searchParams.set('room', newRoomCode())
        location.href = url.href
      }
      break
  }
})

$('#health').addEventListener('input', (e) => set({ health: e.target.value / 100 }))
$('#stamina').addEventListener('input', (e) => set({ stamina: e.target.value / 100 }))
$('#special').addEventListener('input', (e) => set({ special: e.target.value / 100 }))
$('#lights').addEventListener('change', (e) => set({ lights: e.target.value }))
$('#money').addEventListener('change', (e) => set({ money: e.target.value }))
$('#weapon').addEventListener('change', (e) => equip(e.target.value))
$('#bank').addEventListener('change', (e) => set({ bank: Math.max(0, Math.round(+e.target.value || 0)) }))
$('#cash').addEventListener('change', (e) => set({ cash: Math.max(0, Math.round(+e.target.value || 0)) }))
for (const id of ['random', 'recharge']) {
  $(`#${id}`).checked = prefs[id]
  $(`#${id}`).addEventListener('change', (e) => { prefs[id] = e.target.checked; savePrefs() })
}

function show() {
  const nav = state.nav
  const here = locate(nav)
  $('#drive').textContent = nav.drive.on ? 'Stop' : 'Drive'
  $('#drive').classList.toggle('on', nav.drive.on)
  $('#drive').disabled = !nav.route || gpsActive
  $('#kmh').value = nav.drive.kmh
  $('#navOut').textContent = here.track ? `${formatDistance(here.track.length - here.along)} to go` : nav.dest ? 'Routing…' : ''
  $('#starsOut').textContent = `${state.stars}★`
  $('#healthOut').textContent = `${Math.round(state.health * 100)}%`
  $('#staminaOut').textContent = `${Math.round((state.stamina ?? 1) * 100)}%`
  $('#specialOut').textContent = `${Math.round(state.special * 100)}%`
  const focused = document.activeElement
  if (focused !== $('#health')) $('#health').value = Math.round(state.health * 100)
  if (focused !== $('#stamina')) $('#stamina').value = Math.round((state.stamina ?? 1) * 100)
  if (focused !== $('#special')) $('#special').value = Math.round(state.special * 100)
  if (focused !== $('#bank')) $('#bank').value = state.bank
  if (focused !== $('#cash')) $('#cash').value = state.cash
  $('#lights').value = state.lights
  $('#money').value = state.money
  $('#weapon').value = weaponKey(state.weapon)
  $('#ammoOut').textContent = weaponKey(state.weapon) === 'none' ? 'hidden' : !WEAPONS[weaponKey(state.weapon)].mag ? 'no ammo' : `${state.clip ?? 0} / ${state.ammo ?? 0}`
  showWheel()
  $('#evade').classList.toggle('on', state.evading)
  $('#evade').textContent = state.evading ? 'Evading…' : 'Evade'
  $('#useSpecial').classList.toggle('on', state.specialUntil > Date.now())
  document.querySelectorAll('[data-clue]').forEach((b) => b.classList.toggle('on', state.clues.includes(b.dataset.clue)))
}

// ---------- Game loop, once a second ----------

let evadeFor = 0
let nextReport = Date.now() + rand(90, 300) * 1000

setInterval(() => {
  // A phone sending GPS leaves the game logic to the OBS dock, so nothing runs twice.
  if (gpsActive) return
  const now = Date.now()

  // Reaching the waypoint ends the drive there.
  const here = locate(state.nav)
  if (here.track && here.along >= here.track.length - 5) {
    setNav({ pos: here.pos, heading: here.heading, dest: null, destName: '', route: null, ...stopped() })
    $('#destSearch').value = ''
  } else {
    show()
  }

  // Evading: a star drops every 15 s of flashing until you're clear.
  if (state.evading && state.stars > 0) {
    evadeFor += 1
    if (evadeFor >= 15) {
      evadeFor = 0
      const stars = state.stars - 1
      set({ stars, ...(stars === 0 ? { clues: [], evading: false } : {}) })
    }
  }

  // Random witness reports, like the phone app: every 90–300 s, a 40% chance.
  if (prefs.random && now >= nextReport) {
    nextReport = now + rand(90, 300) * 1000
    if (Math.random() < 0.4) {
      raise(state.stars + 1)
      learn('witnesses')
      const unknown = ['clothing', 'face'].filter((c) => !state.clues.includes(c))
      if (unknown.length) learn(unknown[Math.floor(Math.random() * unknown.length)])
    }
  }

  // Special ability drains while running, and can recharge slowly.
  if (state.specialUntil > now) {
    set({ special: Math.max(0, (state.specialUntil - now) / 15000) })
  } else if (state.specialUntil) {
    set({ specialUntil: 0, special: 0 })
  } else if (prefs.recharge && state.special < 1) {
    set({ special: Math.min(1, state.special + 1 / 120) })
  }
}, 1000)

// ---------- Minimap: start, waypoint and the pretend drive ----------

function setNav(patch) { set({ nav: { ...state.nav, ...patch } }) }

/** The drive paused at the current spot (keeps the position along the route). */
function stopped() {
  const here = locate(state.nav)
  return { drive: { ...state.nav.drive, on: false, t0: Date.now(), s0: here.along }, pos: here.pos, heading: here.heading }
}

function toggleDrive() {
  const nav = state.nav
  if (!nav.route) return
  if (nav.drive.on) setNav(stopped())
  else setNav({ drive: { ...nav.drive, on: true, t0: Date.now(), s0: locate(nav).along } })
}

$('#kmh').addEventListener('change', (e) => {
  const here = locate(state.nav)
  setNav({ drive: { ...state.nav.drive, kmh: +e.target.value, t0: Date.now(), s0: here.along } })
})

async function route(dest, name) {
  const here = locate(state.nav)
  const driving = state.nav.drive.on
  setNav({ dest, destName: name, route: null, pos: here.pos, heading: here.heading, drive: { ...state.nav.drive, on: false, s0: 0 } })
  try {
    const r = await fetchRoute(here.pos, dest, here.speed > 0 ? here.heading : null)
    if (state.nav.dest !== dest) return // changed again meanwhile
    setNav({ route: r, drive: { ...state.nav.drive, on: driving, t0: Date.now(), s0: 0 } })
  } catch (err) {
    $('#navOut').textContent = err.message
  }
}

function placeSearch(input, onPick) {
  const list = input.nextElementSibling
  let timer
  let ctrl
  let results = []
  input.addEventListener('input', () => {
    clearTimeout(timer)
    ctrl?.abort()
    const q = input.value.trim()
    if (q.length < 2) { list.hidden = true; return }
    timer = setTimeout(async () => {
      ctrl = new AbortController()
      try {
        results = await searchPlaces(q, locate(state.nav).pos, ctrl.signal)
        list.innerHTML = results.length
          ? results.map((_, i) => `<li data-i="${i}"><span></span><small></small></li>`).join('')
          : '<li class="empty">No places found</li>'
        list.querySelectorAll('li[data-i]').forEach((li) => {
          li.querySelector('span').textContent = results[+li.dataset.i].title
          li.querySelector('small').textContent = results[+li.dataset.i].sub
        })
        list.hidden = false
      } catch (err) {
        if (err.name !== 'AbortError') { list.innerHTML = '<li class="empty">Search unavailable</li>'; list.hidden = false }
      }
    }, 250)
  })
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true }, 150))
  list.addEventListener('mousedown', (e) => e.preventDefault())
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]')
    if (!li) return
    const r = results[+li.dataset.i]
    input.value = r.title
    list.hidden = true
    input.blur()
    onPick(r)
  })
}

placeSearch($('#startSearch'), (r) => {
  const dest = state.nav.dest
  setNav({ pos: r.lngLat, heading: 0, route: null, drive: { ...state.nav.drive, on: false, s0: 0 } })
  if (dest) route(dest, state.nav.destName)
})
placeSearch($('#destSearch'), (r) => route(r.lngLat, r.title))
$('#destSearch').value = state.nav.destName || ''

function rand(a, b) { return a + Math.random() * (b - a) }

function loadPrefs() {
  try { return { random: false, recharge: false, ...JSON.parse(localStorage.getItem('obs-hud-prefs') || '{}') } }
  catch { return { random: false, recharge: false } }
}
function savePrefs() {
  try { localStorage.setItem('obs-hud-prefs', JSON.stringify(prefs)) } catch { /* private mode */ }
}

// ---------- Setup: this streamer's links ----------

function linkFor(page, extra = '') {
  const url = new URL(page, new URL('./', location.href))
  url.search = extra
  url.searchParams.set('room', room)
  const relay = new URLSearchParams(location.search).get('relay')
  if (relay) url.searchParams.set('relay', relay)
  return url.href
}

// Keep the code in this page's own address, so bookmarking or pasting it keeps the room.
if (room && new URLSearchParams(location.search).get('room') !== room) {
  const url = new URL(location.href)
  url.searchParams.set('room', room)
  history.replaceState(null, '', url)
}

$('#roomCode').textContent = room
$('#overlayUrl').textContent = linkFor('index.html')
$('#dockUrl').textContent = linkFor('control.html')
const pieces = [
  ['Health, stamina + special', 'parts=health,stamina,special'],
  ['Weapon + wanted + money', 'parts=weapon,wanted,money'],
  ['Weapon wheel', 'parts=wheel'],
  ['Police lights + purple tint', 'parts=lights,tint'],
  ['Minimap + turn box', 'parts=minimap,directions'],
]
$('#links').innerHTML = pieces.map(([name, q]) => `<div class="link"><span>${name}</span>
  <button data-act="copy" data-url="${linkFor('index.html', q)}">Copy</button><code>${linkFor('index.html', q)}</code></div>`).join('')

// Open the setup steps in a normal browser; inside OBS (the dock) start folded away.
$('#setup').open = !window.obsstudio
$('#relayMissing').hidden = Boolean(relayUrl)

function copy(text, button) {
  const done = () => { button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy' }, 1200) }
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done))
  else fallbackCopy(text, done)
}
function fallbackCopy(text, done) {
  const t = document.createElement('textarea')
  t.value = text
  document.body.append(t)
  t.select()
  document.execCommand('copy')
  t.remove()
  done()
}

// ---------- Sync ----------

// Take whatever the room already has (another dock, or an earlier session); if the room is
// empty once connected, send ours.
let heard = false
subscribe((s) => {
  heard = true
  state = s
  $('#destSearch').value = state.nav.destName || ''
  show()
})
onStatus((st) => {
  const el = $('#status')
  el.className = `status ${st === 'live' ? 'live' : st === 'connecting' ? '' : 'bad'}`
  el.querySelector('b').textContent = { live: 'Live', connecting: 'Connecting…', offline: 'Reconnecting…', 'no-relay': 'No relay', 'no-room': 'No code' }[st]
  if (st === 'live') setTimeout(() => { if (!heard) save(state) }, 800)
})
show()

// ---------- Phone GPS ----------
// With the control page open on a phone, its location (and compass while standing still)
// drives the minimap on stream. Rerouting and arrival happen here too.


const isNum = (x) => typeof x === 'number' && !Number.isNaN(x)
const screenAngle = () => screen.orientation?.angle ?? window.orientation ?? 0

function onCompass(e) {
  const h = isNum(e.webkitCompassHeading) ? e.webkitCompassHeading : e.absolute && isNum(e.alpha) ? 360 - e.alpha : null
  if (h == null) return
  compass = (h + screenAngle() + 360) % 360
  // Standing still: turn the minimap with the phone, a few times a second at most.
  const live = state.nav.live
  if (!gpsActive || !live?.on || (live.speed ?? 0) > 2 || Date.now() - lastCompassSend < 700) return
  if (Math.abs(((compass - (live.heading ?? 0) + 540) % 360) - 180) < 4) return
  lastCompassSend = Date.now()
  setNav({ live: { ...live, heading: compass } })
}

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen') } catch { wakeLock = null }
}
document.addEventListener('visibilitychange', () => {
  if (gpsActive && document.visibilityState === 'visible') keepAwake()
})

async function gpsStart() {
  if (!navigator.geolocation) { $('#gpsOut').textContent = "This browser can't share its location."; return }
  // iPhone asks for compass access only from a tap.
  try {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') await DeviceOrientationEvent.requestPermission()
  } catch {}
  window.addEventListener('deviceorientation', onCompass)
  gpsActive = true
  $('#gpsOut').textContent = 'Finding you…'
  keepAwake()
  gpsWatch = navigator.geolocation.watchPosition(onFix, (err) => {
    $('#gpsOut').textContent = err.code === 1
      ? 'Location is blocked. Allow it for this site in Settings → Safari → Location, then try again.'
      : `No GPS yet (${err.message}). Still trying…`
    if (err.code === 1) gpsStop()
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 })
  showGps()
}

function gpsStop() {
  if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch)
  gpsWatch = null
  window.removeEventListener('deviceorientation', onCompass)
  wakeLock?.release?.()
  wakeLock = null
  const was = gpsActive
  gpsActive = false
  if (was) {
    const here = locate(state.nav)
    setNav({ live: { on: false }, pos: here.pos, heading: here.heading, drive: { ...state.nav.drive, on: false, t0: Date.now(), s0: here.along } })
  }
  showGps()
}

function onFix(p) {
  const pos = [+p.coords.longitude.toFixed(6), +p.coords.latitude.toFixed(6)]
  const speed = isNum(p.coords.speed) && p.coords.speed >= 0 ? p.coords.speed : 0
  const prev = state.nav.live?.on ? state.nav.live.heading : state.nav.heading
  let heading = prev ?? 0
  if (speed > 2 && isNum(p.coords.heading) && p.coords.heading >= 0) heading = p.coords.heading
  else if (lastFix && haversine(lastFix.pos, pos) > 8 && speed > 1) heading = bearing(lastFix.pos, pos)
  else if (compass != null && speed <= 2) heading = compass
  lastFix = { pos, at: Date.now() }

  setNav({ live: { on: true, pos, heading, speed, acc: Math.round(p.coords.accuracy), at: Date.now() }, drive: { ...state.nav.drive, on: false } })
  $('#gpsOut').textContent = `Sending your location (±${Math.round(p.coords.accuracy)} m, ${Math.round(speed * 3.6)} km/h). Keep this page open.`
  followRoute(pos, heading, speed)
}

/** Reroute when you leave the route; clear the waypoint when you get there. */
function followRoute(pos, heading, speed) {
  const nav = state.nav
  if (!nav.route || !nav.dest) { offRouteSince = 0; return }
  const here = locate(nav)
  if (here.track && here.along >= here.track.length - 25 && haversine(pos, nav.dest) < 60) {
    setNav({ dest: null, destName: '', route: null })
    $('#destSearch').value = ''
    $('#navOut').textContent = 'Arrived'
    return
  }
  const off = here.track ? here.track.snap(pos).offset : 0
  if (off < 45) { offRouteSince = 0; return }
  offRouteSince ||= Date.now()
  if (rerouting || Date.now() - offRouteSince < 4000) return
  rerouting = true
  const dest = nav.dest
  fetchRoute(pos, dest, speed > 2 ? heading : null)
    .then((r) => { if (state.nav.dest === dest) setNav({ route: r }) })
    .catch(() => {})
    .finally(() => { rerouting = false; offRouteSince = 0 })
}

function showGps() {
  $('#gps').textContent = gpsActive ? 'Stop sending GPS' : "Use this phone's GPS"
  $('#gps').classList.toggle('on', gpsActive)
  if (!gpsActive && !$('#gpsOut').textContent.startsWith('Location is blocked')) {
    $('#gpsOut').textContent = 'Open this page on your phone and tap the button: the minimap on stream follows you. Keep the page open with the screen on.'
  }
}
