import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import { buildStyle } from './mapStyle.js'
import { angleDiff, bearing, fetchRoutes, haversine, searchPlaces } from './geo.js'

const FALLBACK = [174.7633, -36.8485] // Auckland city centre, used when GPS is unavailable
const FOLLOW_PITCH = 45
const OVERVIEW_MS = 3000
const ARRIVE_M = 22
const OFF_ROUTE_M = 40
const SIM_MULTS = [1, 2, 4, 8]
const imperial = /^en-(US|LR)|^my\b/.test(navigator.language)

const $ = (s) => document.querySelector(s)
const el = {
  minimap: $('.minimap'),
  distance: $('.distance'),
  player: $('.player'),
  waypoint: $('.waypoint'),
  north: $('.north'),
  toast: $('.toast'),
  from: $('#from'),
  to: $('#to'),
  list: $('.suggestions'),
  simSpeed: $('.sim-speed'),
}

const state = {
  target: null, // where the player really is [lng, lat]
  heading: 0, // degrees clockwise from north
  speed: 0, // m/s
  startMode: 'gps', // 'gps' follows the device, 'manual' uses a typed start
  gpsFix: null,
  dest: null,
  routes: [],
  active: 0,
  along: 0,
  offset: 0,
  offSince: 0,
  routing: null,
  lastRouteAt: 0,
  overviewUntil: 0,
  sim: { on: false, s: 0, mult: 1 },
  zoomBias: 0,
}

// What is on screen, eased towards `state` every frame.
const view = { pos: null, heading: 0, padTop: 0 }

const map = new maplibregl.Map({
  container: 'map',
  style: buildStyle(),
  center: FALLBACK,
  zoom: 16.2,
  pitch: FOLLOW_PITCH,
  maxPitch: 70,
  interactive: false,
  attributionControl: false,
  fadeDuration: 150,
})
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
window.__minimap = { map, state }

/* ---------------- position: GPS or fallback ---------------- */

function setPlayer(p, { snap = false } = {}) {
  state.target = p
  if (snap || !view.pos) {
    view.pos = p.slice()
    map.jumpTo({ center: p })
  }
}

function onFix(pos) {
  const p = [pos.coords.longitude, pos.coords.latitude]
  const prev = state.gpsFix
  state.gpsFix = p
  if (state.startMode !== 'gps' || state.sim.on) return
  const moved = prev ? haversine(prev, p) : 0
  const gpsSpeed = pos.coords.speed
  state.speed = gpsSpeed ?? (prev ? moved : 0)
  if (pos.coords.heading != null && !Number.isNaN(pos.coords.heading) && state.speed > 1) state.heading = pos.coords.heading
  else if (moved > 4) state.heading = bearing(prev, p)
  const first = !state.target
  setPlayer(p, { snap: first })
  if (first) toast('GPS locked')
}

function startAtFallback(reason) {
  if (state.target) return
  setPlayer(FALLBACK, { snap: true })
  toast(reason)
}

if ('geolocation' in navigator) {
  navigator.geolocation.watchPosition(onFix, () => startAtFallback('No GPS · starting in Auckland'), {
    enableHighAccuracy: true,
    maximumAge: 1000,
  })
  setTimeout(() => startAtFallback('Waiting for GPS · starting in Auckland'), 5000)
} else {
  startAtFallback('No GPS · starting in Auckland')
}

/* ---------------- routing ---------------- */

const activeRoute = () => state.routes[state.active]

async function requestRoute({ overview = true } = {}) {
  if (!state.dest) return
  const from = state.target ?? FALLBACK
  state.routing?.abort()
  const ctrl = new AbortController()
  state.routing = ctrl
  state.lastRouteAt = performance.now()
  try {
    const routes = await fetchRoutes(from, state.dest, ctrl.signal)
    if (ctrl.signal.aborted) return
    state.routes = routes
    state.active = 0
    state.along = 0
    state.sim.s = 0
    state.offSince = 0
    drawRoutes(true)
    if (overview) showOverview()
    if (routes.length > 1 && overview) toast(`${routes.length} routes · Tab to switch`)
  } catch (err) {
    if (err.name !== 'AbortError') toast(err.message)
  } finally {
    if (state.routing === ctrl) state.routing = null
  }
}

function selectRoute(i) {
  if (state.routes.length < 2) return
  state.active = (i + state.routes.length) % state.routes.length
  const snap = activeRoute().track.snap(state.target)
  state.along = snap.along
  state.sim.s = snap.along
  drawRoutes(true)
  const r = activeRoute()
  toast(`Route ${state.active + 1} of ${state.routes.length} · ${formatDistance(r.distance)} · ${Math.round(r.duration / 60)} min`)
}

let lastDraw = 0
function drawRoutes(force = false) {
  const now = performance.now()
  if (!force && now - lastDraw < 120) return
  lastDraw = now
  const r = activeRoute()
  const route = map.getSource('route')
  const alts = map.getSource('alts')
  if (!route || !alts) return
  route.setData({
    type: 'FeatureCollection',
    features: r ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.track.sliceFrom(state.along) } }] : [],
  })
  const showAlts = r && !state.sim.on && state.speed < 2 && state.along < 50
  alts.setData({
    type: 'FeatureCollection',
    features: showAlts
      ? state.routes
          .map((x, idx) => ({ type: 'Feature', properties: { idx }, geometry: { type: 'LineString', coordinates: x.track.coords } }))
          .filter((f) => f.properties.idx !== state.active)
      : [],
  })
}

function clearRoute(message) {
  state.routing?.abort()
  state.dest = null
  state.routes = []
  state.sim.on = false
  document.body.classList.remove('driving')
  el.to.value = ''
  drawRoutes(true)
  if (message) toast(message)
}

function showOverview() {
  const r = activeRoute()
  if (!r) return
  const bounds = new maplibregl.LngLatBounds()
  for (const x of state.routes) for (const c of x.track.coords) bounds.extend(c)
  bounds.extend(state.target)
  view.padTop = 0
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 })
  const h = el.minimap.clientHeight
  const pad = Math.round(h * 0.14)
  map.fitBounds(bounds, {
    padding: { top: pad + 20, bottom: pad, left: pad, right: pad },
    bearing: map.getBearing(),
    pitch: 35,
    duration: 1400,
    maxZoom: 16.5,
  })
  state.overviewUntil = performance.now() + OVERVIEW_MS
}

// Track progress along the route: remaining distance, trimming, rerouting, arrival.
function updateProgress(now) {
  const r = activeRoute()
  if (!r || !state.target) return
  if (state.sim.on) {
    state.along = state.sim.s
    state.offset = 0
  } else {
    const snap = r.track.snap(state.target)
    state.along = snap.along
    state.offset = snap.offset
  }
  const remaining = r.track.length - state.along + (state.sim.on ? 0 : state.offset)
  if (r.track.length - state.along < ARRIVE_M && state.offset < OFF_ROUTE_M) {
    clearRoute('Waypoint reached')
    return
  }
  if (state.offset > OFF_ROUTE_M) {
    state.offSince ||= now
    if (now - state.offSince > 2500 && !state.routing && now - state.lastRouteAt > 6000) {
      toast('Recalculating')
      requestRoute({ overview: false })
    }
  } else {
    state.offSince = 0
  }
  r.remaining = remaining
  drawRoutes()
}

/* ---------------- simulated drive ---------------- */

function toggleSim() {
  const r = activeRoute()
  if (!r) return toast('Set a waypoint first')
  state.sim.on = !state.sim.on
  if (state.sim.on) {
    state.startMode = state.startMode === 'gps' && state.gpsFix ? 'gps' : state.startMode
    state.sim.s = r.track.snap(state.target).along
    state.overviewUntil = 0
  } else {
    state.speed = 0
  }
  document.body.classList.toggle('driving', state.sim.on)
  drawRoutes(true)
  updateSimLabel()
}

function stepSim(dt) {
  const r = activeRoute()
  if (!r) {
    state.sim.on = false
    return
  }
  const cruise = Math.max(8, Math.min(25, r.distance / r.duration || 14))
  const v = cruise * state.sim.mult
  state.sim.s = Math.min(r.track.length, state.sim.s + v * dt)
  const p = r.track.at(state.sim.s)
  const ahead = r.track.at(state.sim.s + 18)
  if (haversine(p, ahead) > 2) state.heading = bearing(p, ahead)
  state.speed = v
  state.target = p
}

function updateSimLabel() {
  el.simSpeed.hidden = !state.sim.on
  el.simSpeed.innerHTML = `<kbd>[</kbd> <kbd>]</kbd> speed ×${state.sim.mult}`
}

/* ---------------- frame loop: camera + HUD ---------------- */

const ease = (rate, dt) => 1 - Math.exp(-rate * dt)
const lerp = (a, b, t) => a + (b - a) * t
let last = performance.now()
let lastProgress = 0

function frame(now) {
  const dt = Math.min(1, (now - last) / 1000) // time-based, so the drive keeps pace even when frames drop
  last = now
  if (state.sim.on) stepSim(dt)

  if (state.target && view.pos) {
    const k = state.sim.on ? 1 : ease(4, dt)
    view.pos = [lerp(view.pos[0], state.target[0], k), lerp(view.pos[1], state.target[1], k)]
    view.heading = (view.heading + angleDiff(view.heading, state.heading) * ease(state.sim.on ? 6 : 4, dt) + 360) % 360

    if (now > state.overviewUntil && !map.isEasing()) {
      const h = el.minimap.clientHeight
      view.padTop = lerp(view.padTop, h * 0.4, ease(2.5, dt))
      const fast = Math.min(1, state.speed / 28)
      const zoom = lerp(map.getZoom(), 16.3 - fast * 1.1 + state.zoomBias, ease(1.5, dt))
      const b = map.getBearing()
      const c = map.getCenter()
      const kc = ease(5, dt)
      map.jumpTo({
        center: [lerp(c.lng, view.pos[0], kc), lerp(c.lat, view.pos[1], kc)],
        bearing: b + angleDiff(b, view.heading) * ease(2.2, dt),
        pitch: lerp(map.getPitch(), FOLLOW_PITCH, ease(2, dt)),
        zoom,
        padding: { top: view.padTop, bottom: 0, left: 0, right: 0 },
      })
    }
  }

  if (now - lastProgress > 150) {
    lastProgress = now
    updateProgress(now)
  }
  drawHud()
  requestAnimationFrame(frame)
}

function rayToEdge(x, y, angleDeg, inset) {
  const w = el.minimap.clientWidth
  const h = el.minimap.clientHeight
  const a = (angleDeg * Math.PI) / 180
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  let t = Infinity
  if (dx > 1e-6) t = Math.min(t, (w - inset - x) / dx)
  if (dx < -1e-6) t = Math.min(t, (inset - x) / dx)
  if (dy > 1e-6) t = Math.min(t, (h - inset - y) / dy)
  if (dy < -1e-6) t = Math.min(t, (inset - y) / dy)
  return [x + dx * t, y + dy * t]
}

function drawHud() {
  if (!view.pos) return
  const mapBearing = map.getBearing()
  const w = el.minimap.clientWidth
  const h = el.minimap.clientHeight
  const p = map.project(view.pos)

  el.player.hidden = false
  el.player.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${view.heading - mapBearing}deg)`

  const [nx, ny] = rayToEdge(p.x, p.y, -mapBearing, 16)
  el.north.style.transform = `translate(${nx}px, ${ny}px)`

  if (state.dest) {
    el.waypoint.hidden = false
    const q = map.project(state.dest)
    const inset = 20
    const inside = q.x > inset && q.x < w - inset && q.y > inset && q.y < h - inset
    const [wx, wy] = inside ? [q.x, q.y] : rayToEdge(p.x, p.y, bearing(view.pos, state.dest) - mapBearing, inset)
    el.waypoint.style.transform = `translate(${wx}px, ${wy}px)`
  } else {
    el.waypoint.hidden = true
  }

  const r = activeRoute()
  if (r?.remaining != null) {
    el.distance.hidden = false
    el.distance.textContent = formatDistance(r.remaining)
  } else if (state.dest && state.routing) {
    el.distance.hidden = false
    el.distance.textContent = '···'
  } else {
    el.distance.hidden = true
  }
}

function formatDistance(m) {
  if (imperial) {
    const mi = m / 1609.344
    return mi < 0.1 ? `${Math.round((m * 3.28084) / 10) * 10} ft` : `${mi.toFixed(mi < 10 ? 1 : 0)} mi`
  }
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`
}

let toastTimer
function toast(text) {
  el.toast.textContent = text
  el.toast.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.toast.hidden = true), 2600)
}

map.on('load', () => {
  document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
  drawRoutes(true)
  requestAnimationFrame(frame)
})

/* ---------------- map input: drop waypoint, pick alternative, zoom ---------------- */

let down = null
el.minimap.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]))
el.minimap.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
  const rect = map.getCanvas().getBoundingClientRect()
  const pt = [e.clientX - rect.left, e.clientY - rect.top]
  const hits = map.queryRenderedFeatures(
    [
      [pt[0] - 8, pt[1] - 8],
      [pt[0] + 8, pt[1] + 8],
    ],
    { layers: ['alts'] },
  )
  if (hits.length) return selectRoute(hits[0].properties.idx)
  const ll = map.unproject(pt)
  setDestination([ll.lng, ll.lat], 'Dropped waypoint')
})
el.minimap.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    state.zoomBias = Math.max(-4, Math.min(1.5, state.zoomBias - e.deltaY * 0.0025))
  },
  { passive: false },
)

function setDestination(lngLat, label) {
  state.dest = lngLat
  el.to.value = label
  state.routes = []
  drawRoutes(true)
  requestRoute()
}

/* ---------------- search fields ---------------- */

let results = []
let selected = -1
let activeInput = null
let searchCtrl = null
let searchTimer

function renderList() {
  if (!activeInput || (!results.length && !activeInput.value.trim())) {
    el.list.hidden = true
    return
  }
  const field = activeInput.closest('.field')
  el.list.style.left = `${field.offsetLeft}px`
  el.list.style.top = `${field.offsetTop + field.offsetHeight + 6}px`
  el.list.style.width = `${Math.max(field.offsetWidth, 280)}px`
  const items = results.map(
    (r, i) => `<li role="option" data-i="${i}" aria-selected="${i === selected}"><div class="t"></div><div class="s"></div></li>`,
  )
  if (activeInput === el.from) items.unshift(`<li role="option" data-i="-2" aria-selected="${selected === -2}"><div class="t">My location</div><div class="s">Use GPS</div></li>`)
  el.list.innerHTML = items.join('') || '<li class="empty">Searching…</li>'
  el.list.querySelectorAll('li[data-i]').forEach((li) => {
    const r = results[+li.dataset.i]
    if (r) {
      li.querySelector('.t').textContent = r.title
      li.querySelector('.s').textContent = r.sub
    }
  })
  el.list.hidden = false
}

function onInput(e) {
  activeInput = e.target
  selected = -1
  const q = e.target.value.trim()
  clearTimeout(searchTimer)
  searchCtrl?.abort()
  if (q.length < 2) {
    results = []
    renderList()
    return
  }
  searchTimer = setTimeout(async () => {
    searchCtrl = new AbortController()
    try {
      results = await searchPlaces(q, state.target, searchCtrl.signal)
      selected = results.length ? 0 : -1
      renderList()
      if (!results.length) el.list.innerHTML = '<li class="empty">No places found</li>'
    } catch (err) {
      if (err.name !== 'AbortError') el.list.innerHTML = '<li class="empty">Search unavailable</li>'
    }
  }, 220)
}

function choose(i) {
  const input = activeInput
  if (!input) return
  el.list.hidden = true
  if (i === -2) {
    input.value = ''
    state.startMode = 'gps'
    if (state.gpsFix) setPlayer(state.gpsFix, { snap: true })
    toast(state.gpsFix ? 'Using GPS' : 'Waiting for GPS')
    if (state.dest) requestRoute()
  } else {
    const r = results[i]
    if (!r) return
    if (input === el.to) {
      setDestination(r.lngLat, r.title)
    } else {
      input.value = r.title
      state.startMode = 'manual'
      state.sim.on = false
      state.speed = 0
      setPlayer(r.lngLat, { snap: true })
      if (state.dest) requestRoute()
    }
  }
  results = []
  input.blur()
}

for (const input of [el.from, el.to]) {
  input.addEventListener('input', onInput)
  input.addEventListener('focus', () => {
    activeInput = input
    results = []
    selected = -1
    if (input === el.from) {
      el.list.hidden = false
      renderList()
    }
  })
  input.addEventListener('blur', () => setTimeout(() => (el.list.hidden = true), 150))
  input.addEventListener('keydown', (e) => {
    const n = results.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selected = n ? (selected + 1) % n : selected
      renderList()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selected = n ? (selected - 1 + n) % n : selected
      renderList()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (input === el.from && !input.value.trim()) choose(-2)
      else if (n) choose(Math.max(0, selected))
    } else if (e.key === 'Escape') {
      input.blur()
    }
  })
}
el.list.addEventListener('mousedown', (e) => e.preventDefault()) // keep focus in the field
el.list.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]')
  if (li) choose(+li.dataset.i)
})
$('.route-form').addEventListener('submit', (e) => e.preventDefault())

/* ---------------- keyboard ---------------- */

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return
  if (e.key === ' ') {
    e.preventDefault()
    toggleSim()
  } else if (e.key === 'Tab') {
    e.preventDefault()
    selectRoute(state.active + 1)
  } else if (e.key === '/') {
    e.preventDefault()
    el.to.focus()
  } else if (e.key === 'Escape' && state.dest) {
    clearRoute('Waypoint cleared')
  } else if (e.key === ']' || e.key === '[') {
    const i = SIM_MULTS.indexOf(state.sim.mult) + (e.key === ']' ? 1 : -1)
    state.sim.mult = SIM_MULTS[Math.max(0, Math.min(SIM_MULTS.length - 1, i))]
    updateSimLabel()
    toast(`Drive speed ×${state.sim.mult}`)
  }
})

new ResizeObserver(() => map.resize()).observe(el.minimap)
