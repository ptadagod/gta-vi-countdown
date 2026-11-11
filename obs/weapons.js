// Weapons for the HUD, with the icon pictures in obs/icons (the same ones the iPhone app uses).

const icon = (name) => new URL(`./icons/icon-${name}.png`, import.meta.url).href

export const WEAPONS = {
  pistol: { name: 'Pistol', mag: 12, icon: icon('pistol') },
  smg: { name: 'SMG', mag: 30, icon: icon('smg') },
  shotgun: { name: 'Shotgun', mag: 6, icon: icon('shotgun') },
  binoculars: { name: 'Binoculars', mag: 0, icon: icon('binoculars') }, // no ammo
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
