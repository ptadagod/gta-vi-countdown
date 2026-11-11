// The minimap for the OBS overlay: the same MapLibre style as the phone, following the
// position worked out from the control panel's route and drive.

import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildStyle } from '../minimap/mapStyle.js'
import { angleDiff, bearing } from '../minimap/geo.js'
import { arrow, describe, formatDistance, locate } from './nav.js'

const PITCH = 45
const ease = (rate, dt) => 1 - Math.exp(-rate * dt)
const lerp = (a, b, t) => a + (b - a) * t
const EMPTY = { type: 'FeatureCollection', features: [] }
const WORLD = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } }

export function startMinimap(getState, showDirections) {
  const box = document.querySelector('.minimap')
  const el = {
    distance: box.querySelector('.distance'),
    player: box.querySelector('.player'),
    north: box.querySelector('.north'),
    waypoint: box.querySelector('.waypoint'),
    directions: document.querySelector('.directions'),
  }
  box.hidden = false
  const start = locate(getState().nav)
  const map = new maplibregl.Map({
    container: box.querySelector('.map'),
    style: buildStyle(),
    center: start.pos,
    bearing: start.heading,
    zoom: 15.8,
    pitch: PITCH,
    interactive: false,
    attributionControl: false,
    fadeDuration: 150,
  })
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap' }), 'bottom-right')

  const view = { pos: start.pos, heading: start.heading, zoom: 15.8 }
  let ready = false
  let drawnRoute = null
  let drawnAlong = -1
  let tint = null

  map.on('load', () => {
    document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    // Wanted flash: a world-sized fill under the route, so the pink line stays on top.
    map.addSource('police-tint', { type: 'geojson', data: WORLD })
    map.addLayer({ id: 'police-tint', type: 'fill', source: 'police-tint', paint: { 'fill-color': '#ff1f2e', 'fill-opacity': 0, 'fill-antialias': false } }, 'alts')
    ready = true
  })

  let last = performance.now()
  function frame(now) {
    const dt = Math.min(1, (now - last) / 1000)
    last = now
    const state = getState()
    const here = locate(state.nav)
    const w = box.clientWidth
    const h = box.clientHeight

    // Follow smoothly; jump if the position moved a long way (a new start was chosen).
    const far = Math.abs(here.pos[0] - view.pos[0]) + Math.abs(here.pos[1] - view.pos[1]) > 0.01
    const k = far ? 1 : ease(here.speed > 0 ? 8 : 4, dt)
    view.pos = [lerp(view.pos[0], here.pos[0], k), lerp(view.pos[1], here.pos[1], k)]
    view.heading = (view.heading + angleDiff(view.heading, here.heading) * (far ? 1 : ease(4, dt)) + 360) % 360
    const fast = Math.min(1, here.speed / 28)
    view.zoom = lerp(view.zoom, 15.8 - fast * 1.1, ease(1.5, dt))
    // The map turns with you, so you always face straight up.
    map.jumpTo({
      center: view.pos,
      bearing: view.heading,
      pitch: PITCH,
      zoom: view.zoom,
      padding: { top: h * 0.4, bottom: 0, left: 0, right: 0 },
    })

    if (ready) {
      // Route: only the part still ahead, redrawn a few times a second.
      const id = here.route?.id ?? null
      if (id !== drawnRoute || Math.abs(here.along - drawnAlong) > 4) {
        drawnRoute = id
        drawnAlong = here.along
        map.getSource('route').setData(here.track
          ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: here.track.sliceFrom(here.along) } }
          : EMPTY)
      }
      // Hard red/blue switch every 0.6 s while wanted.
      const next = state.stars > 0 ? (Math.floor(Date.now() / 600) % 2 ? 'blue' : 'red') : null
      if (next !== tint) {
        tint = next
        map.setPaintProperty('police-tint', 'fill-color', next === 'blue' ? '#1f61ff' : '#ff1f2e')
        map.setPaintProperty('police-tint', 'fill-opacity', next ? Math.min(0.75, 0.5 + state.stars * 0.03) : 0)
      }
    }

    // Player arrow, north marker and waypoint.
    const mapBearing = map.getBearing()
    const p = map.project(view.pos)
    el.player.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${view.heading - mapBearing}deg)`
    const [nx, ny] = rayToEdge(p.x, p.y, -mapBearing, 12, w, h)
    el.north.style.transform = `translate(${nx}px, ${ny}px)`
    const dest = state.nav.dest
    el.waypoint.hidden = !dest
    if (dest) {
      const q = map.project(dest)
      const inset = 12
      const inside = q.x > inset && q.x < w - inset && q.y > inset && q.y < h - inset
      const [wx, wy] = inside ? [q.x, q.y] : rayToEdge(p.x, p.y, bearing(view.pos, dest) - mapBearing, inset, w, h)
      el.waypoint.style.transform = `translate(${wx}px, ${wy}px)`
    }

    // Distance left and the next turn.
    const remaining = here.track ? here.track.length - here.along : null
    el.distance.hidden = remaining == null
    if (remaining != null) el.distance.textContent = formatDistance(remaining)
    showTurn(here, showDirections)

    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  new ResizeObserver(() => map.resize()).observe(box)

  let shownTurn = ''
  function showTurn(here, enabled) {
    const next = enabled && here.route?.maneuvers.find((m) => m.along > here.along + 3)
    const key = next ? `${next.along}` : ''
    const box = el.directions
    if (!next) {
      if (shownTurn) { shownTurn = ''; box.classList.remove('show') }
      return
    }
    const { text, icon } = describe(next)
    if (key !== shownTurn) {
      shownTurn = key
      box.innerHTML = `<span class="turn">${arrow(icon)}</span><span class="what"><b></b><span></span></span>`
      box.querySelector('.what span').textContent = text
      box.classList.add('show')
    }
    box.querySelector('b').textContent = formatDistance(next.along - here.along)
  }
}

function rayToEdge(x, y, angleDeg, inset, w, h) {
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
