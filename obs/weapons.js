// Weapons, items and the weapon wheel layout for the HUD, with the icon pictures in obs/icons
// (the same ones the iPhone app uses).

const icon = (name) => new URL(`./icons/icon-${name}.png`, import.meta.url).href

export const WEAPONS = {
  pistol: { name: 'Pistol', group: 'Sidearm', mag: 12, start: [12, 80], icon: icon('pistol') },
  smg: { name: 'SMG', group: 'Submachine gun', mag: 30, start: [30, 120], icon: icon('smg') },
  shotgun: { name: 'Shotgun', group: 'Shotgun', mag: 6, start: [6, 18], icon: icon('shotgun') },
  binoculars: { name: 'Binoculars', group: 'Tool', mag: 0, start: [0, 0], icon: icon('binoculars') }, // no ammo
}

export const ITEMS = {
  bandana: { name: 'Bandana', group: 'Face', icon: icon('bandana') },
  cap: { name: 'Racing cap', group: 'Headwear', icon: icon('cap') },
  sunglasses: { name: 'Sunglasses', group: 'Eyewear', icon: icon('sunglasses') },
  outfit: { name: 'Outfit', group: 'Wardrobe', icon: icon('hanger') }, // always on
}

export const FIST = icon('fist')
export const PILLS = icon('pills')
export const INJECTOR = icon('injector')

/** Wheel slots, clockwise from the top: top, upper-right, right, lower-right, bottom, lower-left, left, upper-left. */
export const WHEEL = {
  weapons: ['pistol', 'smg', 'unarmed', 'binoculars', null, null, 'shotgun', null],
  items: ['bandana', null, 'cap', 'outfit', null, null, 'sunglasses', null],
}

/** Name, type and picture for a wheel slot. */
export function slotInfo(tab, key) {
  if (!key) return { name: 'Empty', group: '', icon: null }
  if (key === 'unarmed') return { name: 'Unarmed', group: 'Sidearm', icon: FIST }
  return (tab === 'items' ? ITEMS : WEAPONS)[key]
}

/** The weapon in the state, or SMG for anything unknown (like an old "rifle"); 'none' stays none. */
export function weaponKey(w) {
  if (w === 'none') return 'none'
  return WEAPONS[w] ? w : 'smg'
}

export function weaponImg(kind) {
  const w = WEAPONS[kind]
  return w ? `<img src="${w.icon}" alt="" draggable="false">` : ''
}
