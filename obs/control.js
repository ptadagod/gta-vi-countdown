import { CLUES, MAX_STARS, load, newRoomCode, onStatus, relayUrl, room, save, subscribe, svg } from './shared.js'
import { searchPlaces } from '../minimap/geo.js'
import { fetchRoute, formatDistance, locate } from './nav.js'

// The control panel owns the game logic (blinking, evading, random reports, the special
// ability timer) so every overlay source shows the same thing.
let state = load()
const prefs = loadPrefs()
const $ = (s) => document.querySelector(s)

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
    case 'clearDest': setNav({ dest: null, destName: '', route: null, ...stopped() }); $('#destSearch').value = ''; break
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
$('#special').addEventListener('input', (e) => set({ special: e.target.value / 100 }))
$('#lights').addEventListener('change', (e) => set({ lights: e.target.value }))
$('#money').addEventListener('change', (e) => set({ money: e.target.value }))
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
  $('#drive').disabled = !nav.route
  $('#kmh').value = nav.drive.kmh
  $('#navOut').textContent = here.track ? `${formatDistance(here.track.length - here.along)} to go` : nav.dest ? 'Routing…' : ''
  $('#starsOut').textContent = `${state.stars}★`
  $('#healthOut').textContent = `${Math.round(state.health * 100)}%`
  $('#specialOut').textContent = `${Math.round(state.special * 100)}%`
  const focused = document.activeElement
  if (focused !== $('#health')) $('#health').value = Math.round(state.health * 100)
  if (focused !== $('#special')) $('#special').value = Math.round(state.special * 100)
  if (focused !== $('#bank')) $('#bank').value = state.bank
  if (focused !== $('#cash')) $('#cash').value = state.cash
  $('#lights').value = state.lights
  $('#money').value = state.money
  $('#evade').classList.toggle('on', state.evading)
  $('#evade').textContent = state.evading ? 'Evading…' : 'Evade'
  $('#useSpecial').classList.toggle('on', state.specialUntil > Date.now())
  document.querySelectorAll('[data-clue]').forEach((b) => b.classList.toggle('on', state.clues.includes(b.dataset.clue)))
}

// ---------- Game loop, once a second ----------

let evadeFor = 0
let nextReport = Date.now() + rand(90, 300) * 1000

setInterval(() => {
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
  ['Health + special', 'parts=health,special'],
  ['Wanted + money', 'parts=wanted,money'],
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
