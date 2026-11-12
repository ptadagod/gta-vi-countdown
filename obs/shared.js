// Shared HUD state for the OBS overlay and its control panel.
// Each streamer has a private room code. Their control panel (an OBS custom browser dock,
// or any browser) sends the state to the relay; every overlay source in the same room
// receives it. Different streamers' rooms never mix.

export const MAX_STARS = 6
export const CLUES = ['witnesses', 'clothing', 'face', 'vehicle']

export const defaults = {
  health: 1,
  stamina: 0.8,
  special: 0.6,
  stars: 0,
  clues: [],
  raisedAt: 0, // stars blink quickly for 2.5 s after going up
  evading: false, // stars blink slowly while about to drop
  bank: 15150,
  cash: 3146,
  specialUntil: 0, // purple screen tint while the special ability runs
  lights: 'behind', // where the police lights come from: behind | around | left | right | ahead
  weapon: 'smg', // pistol | smg | shotgun | binoculars | none
  clip: 20, // rounds in the gun
  ammo: 205, // rounds in reserve
  ammoBy: { pistol: [12, 80], shotgun: [6, 18], binoculars: [0, 0] }, // clip + spare for the guns not in hand
  wheel: { open: false, tab: 'weapons', focus: 2 }, // the weapon wheel on stream
  wearing: ['outfit'], // items switched on from the wheel
  pills: 2, // restore health
  injectors: 2, // refill special
  money: 'auto', // auto (hidden while a weapon is out) | always | off
  // Minimap: where you are, the waypoint and route, and the pretend drive along it.
  nav: { pos: null, heading: 0, dest: null, destName: '', route: null, drive: { on: false, t0: 0, s0: 0, kmh: 50 }, live: { on: false } },
}

const params = new URLSearchParams(location.search)
const isControl = location.pathname.endsWith('control.html')
const ROOM_KEY = 'obs-hud-room'
const CODE = /^[a-z0-9]{8,32}$/

/** A fresh private room code, 12 characters. */
export function newRoomCode() {
  const letters = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => letters[b % letters.length]).join('')
}

function pickRoom() {
  const given = params.get('room')?.toLowerCase()
  if (given && CODE.test(given)) return given
  if (!isControl) return import.meta.env.DEV ? 'localdevroom' : null // an overlay needs its code in the link
  let stored = null
  try { stored = localStorage.getItem(ROOM_KEY) } catch { /* private mode */ }
  const code = stored && CODE.test(stored) ? stored : import.meta.env.DEV ? 'localdevroom' : newRoomCode()
  return code
}

/** This page's room code (null for an overlay opened without one). */
export const room = pickRoom()
if (isControl && room) {
  try { localStorage.setItem(ROOM_KEY, room) } catch { /* private mode */ }
}

/** Where the relay is: ?relay=, the build setting, or the dev server itself. */
export const relayUrl = (() => {
  const given = params.get('relay') || import.meta.env.VITE_RELAY_URL
  if (given) return given.replace(/\/$/, '')
  if (import.meta.env.DEV) return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/obs-api`
  return null
})()

const cacheKey = () => `obs-hud-state:${room}`

/** The last state this browser saw for the room, so a reload shows it straight away. */
export function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(cacheKey()) || '{}') }
  } catch {
    return { ...defaults }
  }
}

function cache(state) {
  try { localStorage.setItem(cacheKey(), JSON.stringify(state)) } catch { /* private mode */ }
}

// ---------- Connection to the relay ----------

const me = Math.random().toString(36).slice(2)
const listeners = new Set()
const statusListeners = new Set()
let socket = null
let pending = null // latest state waiting for the socket to open
let status = !room ? 'no-room' : !relayUrl ? 'no-relay' : 'connecting'
let retry = 1000

function setStatus(s) {
  status = s
  for (const fn of statusListeners) fn(s)
}

function connect() {
  if (!room || !relayUrl) return
  setStatus('connecting')
  socket = new WebSocket(`${relayUrl}/room/${room}`)
  socket.onopen = () => {
    retry = 1000
    setStatus('live')
    if (pending) { socket.send(pending); pending = null }
  }
  socket.onmessage = (e) => {
    let msg
    try { msg = JSON.parse(e.data) } catch { return }
    if (msg?.type !== 'state' || !msg.state || msg.from === me) return
    const state = { ...defaults, ...msg.state }
    cache(state)
    for (const fn of listeners) fn(state)
  }
  socket.onclose = () => {
    socket = null
    setStatus('offline')
    setTimeout(connect, retry)
    retry = Math.min(retry * 2, 15000)
  }
}
connect()

/** Sends the state to everything else in the room. */
export function save(state) {
  cache(state)
  const text = JSON.stringify({ type: 'state', from: me, state })
  if (socket?.readyState === WebSocket.OPEN) socket.send(text)
  else pending = text
}

/** Calls back whenever another page in the room changes the state. */
export function subscribe(fn) {
  listeners.add(fn)
}

/** Calls back with the connection status: live, connecting, offline, no-room or no-relay. */
export function onStatus(fn) {
  statusListeners.add(fn)
  fn(status)
}

export const dollars = (n) => '$' + Math.max(0, Math.round(n)).toLocaleString('en-US')

// 24×24 icons.
export const icons = {
  heart: '<path d="M12 21.3l-1.5-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.5 11.5z"/>',
  bolt: '<path d="M13.5 2 4 13.5h6.5L9 22l10-12.5h-6.6z"/>',
  eye: '<path fill-rule="evenodd" d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zM12 17a5 5 0 110-10 5 5 0 010 10zm0-2.2a2.8 2.8 0 100-5.6 2.8 2.8 0 000 5.6z"/>',
  star: '<path d="M12 1.8l3.15 6.6 7.25.95-5.3 5.05 1.35 7.2L12 18.1l-6.45 3.5 1.35-7.2-5.3-5.05 7.25-.95z"/>',
  witnesses: '<path d="M16 11a3 3 0 100-6 3 3 0 000 6zm-8 0a3 3 0 100-6 3 3 0 000 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z"/>',
  clothing: '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M10 6a2 2 0 113 1.7c-.7.4-1 1-1 1.7V10l8.6 6c.8.6.4 1.8-.6 1.8H4c-1 0-1.4-1.2-.6-1.8L12 10"/>',
  face: '<path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/>',
  vehicle: '<path d="M18.9 6c-.2-.6-.8-1-1.4-1h-11c-.7 0-1.2.4-1.4 1L3 12v8c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1h12v1c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-8zM6.5 16a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm11 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM5 11l1.5-4.5h11L19 11z"/>',
  wallet: '<path d="M20 7H5a1 1 0 010-2h13V3H5a3 3 0 00-3 3v12a3 3 0 003 3h15a2 2 0 002-2V9a2 2 0 00-2-2zm-3 8.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/>',
  bank: '<path d="M10.5 3v2H8v14h2.5v2h2v-2h1c2.2 0 4-1.6 4-3.8 0-1.4-.7-2.6-1.9-3.2.8-.6 1.3-1.6 1.3-2.7C16.9 7.2 15.3 5.6 13.4 5.2V3h-2v2h-.9V3zM11 8h2.6c.9 0 1.6.6 1.6 1.4s-.7 1.4-1.6 1.4H11zm0 5.6h3c1 0 1.8.7 1.8 1.6s-.8 1.6-1.8 1.6h-3z"/>',
}

export const svg = (name) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${icons[name]}</svg>`
