// Writes the web minimap's map style as JSON for the iOS app, so both share one look.
// Run from the repo root: node ios/tools/export-style.mjs
import { writeFileSync } from 'node:fs'
import { buildStyle } from '../../minimap/mapStyle.js'

const style = buildStyle()
delete style.sky // not supported by MapLibre Native; the HUD draws its own haze
style.name = 'Minimap'
writeFileSync(new URL('../MinimapNav/minimap-style.json', import.meta.url), JSON.stringify(style, null, 2) + '\n')
console.log('Wrote ios/MinimapNav/minimap-style.json')
