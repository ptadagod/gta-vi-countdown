// Weapon icons for the HUD: simple side-view silhouettes, drawn as polygons in a 128×44 box
// with the barrel pointing left. ios/MinimapNav/Weapon.swift draws the same shapes.

export const WEAPONS = {
  rifle: {
    name: 'Rifle',
    mag: 30,
    shapes: [
      [[2, 13], [28, 13], [28, 16], [2, 16]],                    // barrel
      [[15, 13], [16, 6], [19, 6], [21, 13]],                    // front sight
      [[24, 10], [54, 10], [54, 19], [24, 19]],                  // handguard
      [[52, 8], [88, 8], [88, 19], [52, 19]],                    // upper receiver
      [[58, 8], [59, 3], [81, 3], [83, 8], [79, 8], [78, 6], [62, 6], [61, 8]], // carry handle
      [[54, 19], [88, 19], [88, 24], [56, 24]],                  // lower receiver
      [[60, 24], [70, 24], [67, 41], [57, 39]],                  // magazine
      [[79, 24], [87, 24], [84, 37], [76, 36]],                  // grip
      [[71, 24], [73, 24], [73, 28], [80, 28], [80, 30], [71, 30]], // trigger guard
      [[86, 10], [99, 10], [99, 16], [86, 16]],                  // buffer tube
      [[97, 8], [124, 10], [126, 27], [118, 27], [99, 18]],      // stock
    ],
  },
  shotgun: {
    name: 'Shotgun',
    mag: 6,
    shapes: [
      [[2, 14], [72, 14], [72, 17.5], [2, 17.5]],                // barrel
      [[4, 14], [5, 11.5], [7, 11.5], [8, 14]],                  // bead sight
      [[12, 18.5], [72, 18.5], [72, 22], [12, 22]],              // magazine tube
      [[66, 11], [92, 11], [93, 24], [66, 24]],                  // receiver
      [[76, 24], [78, 24], [78, 28], [87, 28], [87, 24], [89, 24], [89, 30], [76, 30]], // trigger guard
    ],
    wood: [
      [[24, 17], [50, 17], [50, 24], [24, 24]],                  // pump
      [[92, 12], [104, 15], [126, 22], [126, 33], [118, 33], [97, 25], [92, 24]], // stock
    ],
  },
  pistol: {
    name: 'Pistol',
    mag: 12,
    shapes: [
      [[34, 10], [92, 10], [92, 20], [34, 20]],                  // slide
      [[36, 10], [37, 7], [40, 7], [41, 10]],                    // front sight
      [[85, 10], [86, 7], [90, 7], [90, 10]],                    // rear sight
      [[36, 20], [92, 20], [92, 25], [50, 25], [48, 23], [36, 23]], // frame
      [[74, 25], [92, 25], [99, 42], [82, 42]],                  // grip
      [[58, 25], [60, 25], [60, 30], [72, 30], [72, 25], [74, 25], [74, 33], [58, 33]], // trigger guard
    ],
  },
}

export function weaponSvg(kind) {
  const w = WEAPONS[kind]
  if (!w) return ''
  const path = (list) => list.map((pts) => 'M' + pts.map((p) => p.join(' ')).join('L') + 'Z').join('')
  const d = path([...w.shapes, ...(w.wood ?? [])])
  return `<svg viewBox="0 0 128 44" aria-hidden="true">
    <path d="${d}" fill="#e6e6e6" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`
}
