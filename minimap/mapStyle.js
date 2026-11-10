// Custom MapLibre style that renders real OpenStreetMap geography (via the
// OpenMapTiles schema served by OpenFreeMap) in the soft, muted look of the
// in-game minimap: beige ground, grey-green parks, slate water, cream roads,
// extruded buildings with a fake soft shadow, and a pink GPS route.

export const PINK = '#f2368f'

const C = {
  ground: '#e4ddcf',
  residential: '#dfd7c8',
  industrial: '#d9d3c8',
  park: '#cbd0b2',
  wood: '#c3c9aa',
  sand: '#ebe2ca',
  water: '#9fb4ba',
  waterEdge: '#93a9b0',
  aeroway: '#d8d1c3',
  casing: '#c4baa8',
  road: '#faf7f1',
  roadMajor: '#fffdf8',
  rail: '#c2b9aa',
  building: '#d6cdbd',
  buildingTop: '#e7e0d3',
}

const zw = (pairs) => ['interpolate', ['exponential', 1.6], ['zoom'], ...pairs]

const isClass = (...classes) => ['match', ['get', 'class'], classes, true, false]

function road(id, filter, casingW, fillW, color = C.road, extra = {}, o = OPAQUE) {
  return [
    {
      id: `${id}-casing`,
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.casing, 'line-width': zw(casingW), 'line-opacity': o.casing, ...extra.casing },
    },
    {
      id: `${id}-fill`,
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': zw(fillW), 'line-opacity': o.road, ...extra.fill },
    },
  ]
}

// Layer opacities. TRANSPARENT lets a camera feed show through the ground while
// roads, buildings and the route stay readable (used by the iOS HUD).
const OPAQUE = { ground: 1, landuse: 0.8, landcover: 0.85, park: 0.9, water: 1, casing: 1, road: 1, shadow: 0.14, building: 0.9 }
const TRANSPARENT = { ground: 0.18, landuse: 0.12, landcover: 0.16, park: 0.25, water: 0.35, casing: 0.35, road: 0.72, shadow: 0.05, building: 0.42 }

const notTunnel = ['!=', ['get', 'brunnel'], 'tunnel']

export function buildStyle({ transparent = false } = {}) {
  const o = transparent ? TRANSPARENT : OPAQUE
  return {
    version: 8,
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      alts: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      route: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, lineMetrics: true },
    },
    light: { anchor: 'map', position: [1.4, 200, 40], color: '#fff3e2', intensity: 0.32 },
    sky: {
      'sky-color': '#d7d0c3',
      'horizon-color': '#ece5d8',
      'fog-color': '#e6dfd2',
      'sky-horizon-blend': 0.7,
      'horizon-fog-blend': 0.8,
      'fog-ground-blend': 0.35,
      'atmosphere-blend': 0,
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': C.ground, 'background-opacity': o.ground } },
      {
        id: 'landuse',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        paint: {
          'fill-color': [
            'match', ['get', 'class'],
            ['residential', 'suburb', 'neighbourhood'], C.residential,
            ['industrial', 'commercial', 'retail', 'railway'], C.industrial,
            ['cemetery', 'pitch', 'stadium', 'playground'], C.park,
            C.ground,
          ],
          'fill-opacity': o.landuse,
        },
      },
      {
        id: 'landcover',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        paint: {
          'fill-color': [
            'match', ['get', 'class'],
            'wood', C.wood,
            ['sand', 'rock', 'ice'], C.sand,
            C.park,
          ],
          'fill-opacity': o.landcover,
        },
      },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': C.park, 'fill-opacity': o.park } },
      { id: 'aeroway', type: 'fill', source: 'omt', 'source-layer': 'aeroway', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': C.aeroway, 'fill-opacity': o.landuse } },
      {
        id: 'water',
        type: 'fill',
        source: 'omt',
        'source-layer': 'water',
        paint: { 'fill-color': C.water, 'fill-outline-color': C.waterEdge, 'fill-opacity': o.water, 'fill-antialias': true },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'omt',
        'source-layer': 'waterway',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': C.water, 'line-opacity': o.water, 'line-width': zw([10, 0.5, 18, 6]) },
      },

      // Roads, minor first so major roads draw on top.
      ...road('path', ['all', isClass('path', 'track'), notTunnel], [14, 0, 18, 3], [14, 0, 18, 1.6], C.road, { fill: { 'line-opacity': 0.7 * o.road }, casing: { 'line-opacity': 0.4 * o.casing } }),
      ...road('minor', ['all', isClass('minor', 'service'), notTunnel], [12, 0.5, 18, 14], [12, 0.3, 18, 11], C.road, {}, o),
      ...road('tertiary', ['all', isClass('tertiary', 'secondary'), notTunnel], [9, 0.6, 18, 22], [9, 0.4, 18, 18], C.road, {}, o),
      ...road('primary', ['all', isClass('primary', 'trunk'), notTunnel], [7, 0.8, 18, 28], [7, 0.5, 18, 23], C.roadMajor, {}, o),
      ...road('motorway', ['all', isClass('motorway'), notTunnel], [5, 1, 18, 34], [5, 0.6, 18, 28], C.roadMajor, {}, o),
      {
        id: 'rail',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['all', isClass('rail', 'transit'), notTunnel],
        paint: { 'line-color': C.rail, 'line-width': zw([12, 0.5, 18, 3]) },
      },

      // Soft contact shadow under every building, then the 3D extrusion.
      {
        id: 'building-shadow',
        type: 'fill',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-color': '#5b4f3d',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, o.shadow],
          'fill-translate': [3, 4],
          'fill-translate-anchor': 'map',
          'fill-antialias': false,
        },
      },

      {
        id: 'building-3d',
        type: 'fill-extrusion',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 14,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
            0, C.building, 60, C.buildingTop,
          ],
          // Squashed heights: the minimap shows soft blocks, not a skyline.
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['*', 0.3, ['min', 160, ['coalesce', ['get', 'render_height'], 6]]]],
          'fill-extrusion-base': ['*', 0.3, ['min', 160, ['coalesce', ['get', 'render_min_height'], 0]]],
          'fill-extrusion-opacity': o.building,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      // GPS route: faded alternatives, then glow, casing and the main line.
      {
        id: 'alts',
        type: 'line',
        source: 'alts',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PINK, 'line-opacity': 0.38, 'line-width': zw([10, 2, 18, 10]) },
      },
      {
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PINK, 'line-opacity': 0.35, 'line-blur': 6, 'line-width': zw([10, 8, 18, 30]) },
      },
      {
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#b81f68', 'line-opacity': 0.55, 'line-width': zw([10, 4.5, 18, 17]) },
      },
      {
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PINK, 'line-width': zw([10, 3, 18, 13]) },
      },

    ],
  }
}
