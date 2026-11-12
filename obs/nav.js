// Minimap navigation shared by the overlay and the control panel. The control panel
// stores the route and a "drive" (start time, start distance, speed); every overlay
// works out where you are from that, so all sources stay in step without a constant feed.

import { Track, bearing, haversine } from '../minimap/geo.js'

export const FALLBACK = [174.7633, -36.8485] // Auckland city centre

let cached = { id: null, track: null }
function trackFor(route) {
  if (!route) return null
  if (cached.id !== route.id) cached = { id: route.id, track: new Track(route.coords) }
  return cached.track
}

/** Where you are right now: { pos, heading, along, speed (m/s), track, route }. */
export function locate(nav, now = Date.now()) {
  // Live GPS from a phone: use its position, and work out how far along the route it is.
  const live = nav.live
  if (live?.on && live.pos) {
    const track = trackFor(nav.route)
    const along = track ? track.snap(live.pos).along : 0
    return { pos: live.pos, heading: live.heading ?? 0, along, speed: live.speed ?? 0, track, route: track ? nav.route : null, live: true }
  }
  const route = nav.route
  const track = trackFor(route)
  if (!track) return { pos: nav.pos || FALLBACK, heading: nav.heading || 0, along: 0, speed: 0, track: null, route: null }
  const d = nav.drive
  const speed = d.on ? d.kmh / 3.6 : 0
  const along = Math.min(track.length, d.s0 + (d.on ? (speed * (now - d.t0)) / 1000 : 0))
  const pos = track.at(along)
  // Look a little ahead for the heading; at the very end, look back instead.
  const ahead = track.at(along + 18)
  const heading = haversine(pos, ahead) > 1 ? bearing(pos, ahead) : bearing(track.at(along - 18), pos)
  return { pos, heading, along, speed: along < track.length ? speed : 0, track, route }
}

/** Driving routes with turn steps from OSRM, like the phone app. */
export async function fetchRoute(from, to, heading) {
  let url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}` +
    '?overview=full&geometries=geojson&steps=true'
  if (heading != null) url += `&bearings=${Math.round(heading) % 360},60;`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Routing failed (${res.status})`)
  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found')
  const r = data.routes[0]
  const coords = r.geometry.coordinates.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)])
  const track = new Track(coords)
  const maneuvers = r.legs.flatMap((l) => l.steps).map((s) => ({
    type: s.maneuver.type,
    modifier: s.maneuver.modifier,
    exit: s.maneuver.exit,
    street: [s.name, s.ref].find((x) => x) || '',
    along: Math.round(track.snap(s.maneuver.location).along),
  }))
  return { id: Date.now(), coords, maneuvers, distance: r.distance, duration: r.duration }
}

/** Instruction text and icon name for one OSRM step (same wording as the phone). */
export function describe({ type, modifier, exit, street }) {
  const m = modifier || 'straight'
  const onto = street ? ` onto ${street}` : ''
  const turnIcon = { left: 'left', 'sharp left': 'left', right: 'right', 'sharp right': 'right', 'slight left': 'slightLeft', 'slight right': 'slightRight', uturn: 'uturn' }[m] || 'up'
  const direction = m === 'uturn' ? 'Make a U-turn' : m === 'straight' ? 'Continue straight' : `Turn ${m}`
  const side = m.replace('slight ', '')
  switch (type) {
    case 'arrive': return { text: 'Arrive at destination', icon: 'flag' }
    case 'depart': return { text: street ? `Head along ${street}` : 'Head out', icon: 'up' }
    case 'roundabout':
    case 'rotary': {
      const ordinal = exit ? ({ 1: '1st', 2: '2nd', 3: '3rd' }[exit] || `${exit}th`) : 'next'
      return { text: `At the roundabout, take the ${ordinal} exit${onto}`, icon: 'roundabout' }
    }
    case 'roundabout turn':
    case 'exit roundabout':
    case 'exit rotary': return { text: `At the roundabout, ${direction.toLowerCase()}${onto}`, icon: 'roundabout' }
    case 'merge': return { text: `Merge${m === 'straight' ? '' : ` ${m}`}${onto}`, icon: 'merge' }
    case 'on ramp': return { text: `Take the ramp${m === 'straight' ? '' : ` on the ${side}`}${onto}`, icon: turnIcon }
    case 'off ramp': return { text: `Take the exit${m === 'straight' ? '' : ` on the ${side}`}${onto}`, icon: turnIcon }
    case 'fork': return { text: `Keep ${side}${onto}`, icon: m.includes('left') ? 'slightLeft' : m.includes('right') ? 'slightRight' : 'fork' }
    case 'new name':
    case 'continue':
    case 'notification': {
      const turns = ['left', 'right', 'sharp left', 'sharp right', 'uturn'].includes(m)
      return { text: turns ? `${direction}${onto}` : `Continue${onto}`, icon: turns ? turnIcon : 'up' }
    }
    default: return { text: `${direction}${onto}`, icon: turnIcon }
  }
}

export function formatDistance(m) {
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`
}

// Stroked 24×24 turn arrows.
const arrows = {
  up: 'M12 20V5M6 11l6-6 6 6',
  left: 'M17 20v-7a3 3 0 00-3-3H5M9 6l-4 4 4 4',
  right: 'M7 20v-7a3 3 0 013-3h9M15 6l4 4-4 4',
  slightLeft: 'M14 20v-6L7 7M7 13V7h6',
  slightRight: 'M10 20v-6l7-7M17 13V7h-6',
  uturn: 'M16 20V9a5 5 0 00-10 0v4M3 10l3 3 3-3',
  roundabout: 'M12 20v-5M12 15a4 4 0 114-4M16 11V6M13 8l3-3 3 3',
  merge: 'M12 20v-8L6 4M12 12l6-8M15 4h3v3',
  fork: 'M12 20v-6M12 14L7 7M12 14l5-7M5 9V6h3M19 9V6h-3',
  flag: 'M6 21V4M6 4h11l-2 4 2 4H6',
}
export const arrow = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${arrows[name] || arrows.up}"/></svg>`
