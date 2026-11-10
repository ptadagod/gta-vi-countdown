// Small geodesy helpers, plus the free routing and search services.

const R = 6371008.8
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

export function haversine([lng1, lat1], [lng2, lat2]) {
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function bearing([lng1, lat1], [lng2, lat2]) {
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2))
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

export const angleDiff = (a, b) => ((b - a + 540) % 360) - 180

/** A route line with cumulative distances, for snapping and slicing. */
export class Track {
  constructor(coords) {
    this.coords = coords
    this.cum = [0]
    for (let i = 1; i < coords.length; i++) this.cum.push(this.cum[i - 1] + haversine(coords[i - 1], coords[i]))
    this.length = this.cum[this.cum.length - 1]
  }

  /** Point and heading at distance s along the line. */
  at(s) {
    const { coords, cum } = this
    s = Math.max(0, Math.min(this.length, s))
    let i = 1
    while (i < cum.length - 1 && cum[i] < s) i++
    const seg = cum[i] - cum[i - 1] || 1
    const t = (s - cum[i - 1]) / seg
    const a = coords[i - 1]
    const b = coords[i]
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  }

  /** Nearest point on the line: { along, offset } in metres. */
  snap(p) {
    const { coords, cum } = this
    const kx = Math.cos(rad(p[1])) * 111320
    const ky = 110540
    let best = { along: 0, offset: Infinity }
    for (let i = 1; i < coords.length; i++) {
      const ax = (coords[i - 1][0] - p[0]) * kx
      const ay = (coords[i - 1][1] - p[1]) * ky
      const bx = (coords[i][0] - p[0]) * kx
      const by = (coords[i][1] - p[1]) * ky
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy || 1e-9
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
      const d = Math.hypot(ax + dx * t, ay + dy * t)
      if (d < best.offset) best = { along: cum[i - 1] + (cum[i] - cum[i - 1]) * t, offset: d }
    }
    return best
  }

  /** The part of the line from distance s to the end. */
  sliceFrom(s) {
    const { coords, cum } = this
    let i = 0
    while (i < cum.length - 1 && cum[i] <= s) i++
    return [this.at(s), ...coords.slice(i)]
  }
}

export async function fetchRoutes(from, to, signal) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}` +
    '?alternatives=3&overview=full&geometries=geojson&steps=false'
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Routing failed (${res.status})`)
  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found')
  return data.routes.map((r) => ({
    track: new Track(r.geometry.coordinates),
    duration: r.duration,
    distance: r.distance,
  }))
}

export async function searchPlaces(q, near, signal) {
  const params = new URLSearchParams({ q, limit: '6', lang: 'en' })
  if (near) {
    params.set('lon', near[0].toFixed(4))
    params.set('lat', near[1].toFixed(4))
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal })
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  const seen = new Set()
  return data.features
    .map((f) => {
    const p = f.properties
    const title = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || p.city || 'Unnamed place'
    const kind = p.osm_value && p.osm_value !== 'yes' ? p.osm_value.replace(/_/g, ' ') : null
    const sub = [kind, p.name && p.street ? [p.housenumber, p.street].filter(Boolean).join(' ') : null, p.district || p.locality, p.city, p.country]
      .filter((x) => x && x !== title)
      .map((x, i) => (i === 0 && x === kind ? x[0].toUpperCase() + x.slice(1) : x))
      .filter((x, i, a) => a.indexOf(x) === i)
      .join(', ')
    return { title, sub, lngLat: f.geometry.coordinates }
  })
    .filter((r) => !seen.has(r.title + r.sub) && seen.add(r.title + r.sub))
}
