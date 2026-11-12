import { CLUES, MAX_STARS, dollars, load, subscribe, svg } from './shared.js'
import { INJECTOR, PILLS, WEAPONS, WHEEL, slotInfo, weaponImg, weaponKey } from './weapons.js'

// ---------- Weapon wheel ----------

// Slot centres (in --u units), clockwise from the top; the phone app's octagon, 1.3× bigger.
const SPOTS = [[0, -166], [143, -104], [179, 0], [143, 104], [0, 166], [-143, 104], [-179, 0], [-143, -104]]
const $wheel = (sel) => document.querySelector(`.wheel ${sel}`)
let wheelKey = ''

function renderWheel(s) {
  const w = { tab: 'weapons', focus: 2, ...s.wheel }
  const keys = WHEEL[w.tab] ?? WHEEL.weapons
  const current = weaponKey(s.weapon)
  const wearing = s.wearing ?? []
  const ammoOf = (k) => (k === current ? [s.clip ?? 0, s.ammo ?? 0] : s.ammoBy?.[k] ?? WEAPONS[k].start)

  // Rebuild only when something on the wheel changed.
  const key = JSON.stringify([w, current, s.clip, s.ammo, s.ammoBy, wearing, s.pills, s.injectors])
  if (key === wheelKey) return
  wheelKey = key

  document.querySelectorAll('.wheel-tabs span').forEach((t) => t.classList.toggle('on', t.dataset.tab === w.tab))
  const f = slotInfo(w.tab, keys[w.focus])
  $wheel('.wheel-label b').textContent = f.name
  $wheel('.wheel-label span').textContent = f.group

  $wheel('.slots').innerHTML = keys.map((k, i) => {
    const info = slotInfo(w.tab, k)
    const [x, y] = SPOTS[i]
    const equipped = w.tab === 'weapons' && (k === 'unarmed' ? current === 'none' : k === current)
    let strip = ''
    if (w.tab === 'weapons' && WEAPONS[k]?.mag) {
      const [clip, spare] = ammoOf(k)
      strip = `<div class="strip"><span>${clip}</span><span class="spare">${spare}</span></div>`
    } else if (w.tab === 'items' && k && k !== 'outfit') {
      strip = `<div class="strip word">${wearing.includes(k) ? 'ON' : 'OFF'}</div>`
    }
    const cls = ['slot', !k && 'empty', i === w.focus && 'focus', strip && 'has-strip', k === 'unarmed' && 'unarmed'].filter(Boolean).join(' ')
    return `<div class="${cls}" style="--x:${x};--y:${y}">
      ${equipped ? '<div class="glow"></div>' : ''}
      <div class="pic">${info.icon ? `<img src="${info.icon}" alt="">` : '<span class="plus">+</span>'}</div>
      ${strip}${k === 'outfit' ? '<div class="tick">✓</div>' : ''}
    </div>`
  }).join('')

  const card = (img, n, badge, color) => `<div class="consumable${n > 0 ? '' : ' out'}">
    <div class="pic"><img src="${img}" alt=""></div>
    <div class="strip"><span>${n}</span><span class="badge-dot" style="--c:${color}">${svg(badge)}</span></div>
  </div>`
  $wheel('.consumables').innerHTML = card(PILLS, s.pills ?? 0, 'heart', '#edb8cc') + card(INJECTOR, s.injectors ?? 0, 'eye', '#ab94fa')
}

// Options from the source URL, e.g. index.html?parts=wanted,money&scale=1.5
const params = new URLSearchParams(location.search)
const parts = new Set((params.get('parts') || 'health,stamina,special,weapon,wanted,money,lights,tint,minimap,directions,wheel').split(','))
const scale = Number(params.get('scale')) || 1
document.documentElement.style.setProperty('--u', `${2 * scale}px`)
if (params.has('preview')) document.body.classList.add('preview')
document.querySelectorAll('[data-part]').forEach((el) => { el.hidden = !parts.has(el.dataset.part) })

const $ = (s) => document.querySelector(s)
$('.health .badge').innerHTML = svg('heart')
$('.stamina .badge').innerHTML = svg('bolt')
$('.special .badge').innerHTML = svg('eye')
$('.stars').innerHTML = Array.from({ length: MAX_STARS }, () => `<span class="star">${svg('star')}</span>`).join('')
const stars = [...document.querySelectorAll('.star')]

let state = load()
subscribe((s) => { state = s; render() })

function ring(name, color, progress) {
  const r = 8.4
  const len = 2 * Math.PI * r
  const p = Math.max(0.02, Math.min(1, progress))
  return `<svg viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="10" fill="#2b2b2b"/>
    <circle cx="10" cy="10" r="${r}" fill="none" stroke="#171717" stroke-width="2.2"/>
    <circle cx="10" cy="10" r="${r}" fill="none" stroke="${color}" stroke-width="2.2"
      stroke-dasharray="${len * p} ${len}" transform="rotate(-90 10 10)"/>
    <g transform="translate(5.6 5.6) scale(0.367)" fill="${color}">${svg(name).replace(/<\/?svg[^>]*>/g, '')}</g>
  </svg>`
}

let shownClues = ''
let shownGun = ''
function render() {
  const s = state
  $('.health .fill').style.width = `${s.health * 100}%`
  $('.health').classList.toggle('low', s.health < 0.2)
  const stamina = s.stamina ?? 1
  $('.stamina .fill').style.width = `${stamina * 100}%`
  $('.stamina').classList.toggle('low', stamina < 0.2)
  const active = s.specialUntil > Date.now()
  $('.special .fill').style.width = `${s.special * 100}%`
  $('.special').classList.toggle('full', s.special >= 1)
  $('.special').classList.toggle('active', active)
  $('.tint').classList.toggle('on', active && parts.has('tint'))

  const weapon = weaponKey(s.weapon)
  $('.weapon').hidden = !parts.has('weapon') || weapon === 'none'
  if (weapon !== shownGun) { shownGun = weapon; $('.gun').innerHTML = weaponImg(weapon) }
  $('.ammo').style.visibility = WEAPONS[weapon]?.mag ? '' : 'hidden'
  $('.clip').textContent = s.clip ?? 0
  $('.clip').classList.toggle('empty', !s.clip)
  $('.reserve').textContent = s.ammo ?? 0

  $('.wanted').classList.toggle('off', s.stars === 0)
  const clues = CLUES.filter((c) => s.clues.includes(c)).join()
  if (clues !== shownClues) {
    shownClues = clues
    $('.clues').innerHTML = s.clues.length
      ? CLUES.filter((c) => s.clues.includes(c)).map((c) => `<span class="clue">${svg(c)}</span>`).join('')
      : ''
  }

  // Money sits where the stars are when you're not wanted, like the phone app.
  // Weapon wheel (from the dock). While it's open the cash takes the top spot, unless wanted.
  const wheelOpen = parts.has('wheel') && Boolean(s.wheel?.open)
  document.body.classList.toggle('wheel-open', wheelOpen)
  $('.wheel').hidden = !wheelOpen
  if (wheelOpen) renderWheel(s)

  // Money shows while no weapon is out (or on the open wheel when not wanted).
  const money = wheelOpen ? s.stars === 0 && s.money !== 'off'
    : s.money === 'always' || (s.money === 'auto' && weaponKey(s.weapon) === 'none')
  $('.money').hidden = !parts.has('money') || !money
  $('.bank .amount').textContent = dollars(s.bank)
  $('.cash .amount').textContent = dollars(s.cash)
  $('.bank .ring').innerHTML = ring('bank', '#b87aff', (s.bank % 10000) / 10000)
  $('.cash .ring').innerHTML = ring('wallet', '#8ce080', (s.cash % 100) / 100)
}
render()

if (parts.has('minimap')) {
  import('./minimap.js').then(({ startMinimap }) => startMinimap(() => state, parts.has('directions')))
}

// Star blinking: fast for 2.5 s after going up, slow while evading.
function blink(now) {
  const s = state
  const off = now - s.raisedAt < 2500 ? Math.floor(now / 1000 * 6) % 2 === 0
    : s.evading ? Math.floor(now / 1000 * 2) % 2 === 0 : false
  stars.forEach((el, i) => el.classList.toggle('lit', i >= MAX_STARS - s.stars && !off))
}

// ---------- Police lights on the screen edge ----------

const canvas = $('.lights')
const ctx = canvas.getContext('2d')
function resize() {
  canvas.width = innerWidth * devicePixelRatio
  canvas.height = innerHeight * devicePixelRatio
}
addEventListener('resize', resize)
resize()

const cops = [{ strength: 0 }, { strength: 0 }]
const angleDiff = (a, b) => ((b - a + 540) % 360) - 180

/** Where each of the two police cars is, in degrees from straight ahead. */
function targets(t) {
  switch (state.lights) {
    case 'ahead': return [-14 + 6 * Math.sin(t * 0.21), 14 + 6 * Math.sin(t * 0.17)]
    case 'left': return [-90 - 12 * Math.sin(t * 0.2), -120 + 10 * Math.sin(t * 0.15)]
    case 'right': return [90 + 12 * Math.sin(t * 0.2), 120 - 10 * Math.sin(t * 0.15)]
    case 'around': return [70 * Math.sin(t * 0.05) + 40 * Math.sin(t * 0.13), 180 + 90 * Math.sin(t * 0.04 + 2)]
    default: return [160 + 10 * Math.sin(t * 0.23), 200 + 10 * Math.sin(t * 0.19)] // behind
  }
}

let last = performance.now()
function lights(nowMs) {
  const dt = Math.min(0.5, (nowMs - last) / 1000)
  last = nowMs
  const t = nowMs / 1000
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  if (!parts.has('lights')) return

  const n = state.stars > 0 ? Math.min(2, state.stars) : 0 // two sets of lights at most
  const k = 1 - Math.exp(-3 * dt)
  const goal = targets(t)
  cops.forEach((c, i) => {
    if (c.angle === undefined) c.angle = goal[i]
    c.angle += angleDiff(c.angle, goal[i]) * k
    c.strength += ((i < n ? 0.85 : 0) - c.strength) * k
  })

  const stars = Math.max(state.stars, 1)
  const intensity = 0.55 + 0.09 * stars
  const radius = Math.min(w, h) * 0.15 * (0.85 + 0.05 * stars)
  const cx = w / 2
  const cy = h / 2
  ctx.globalCompositeOperation = 'lighter'
  cops.forEach((c, i) => {
    if (c.strength < 0.01) return
    const a = (c.angle * Math.PI) / 180
    const dx = Math.sin(a)
    const dy = -Math.cos(a)
    const reach = Math.min(Math.abs(dx) > 1e-6 ? cx / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? cy / Math.abs(dy) : Infinity)
    const ex = cx + dx * reach + dx * radius * 0.25
    const ey = cy + dy * reach + dy * radius * 0.25
    const spread = radius * 0.55
    const at = (side) => [ex - dy * spread * side, ey + dx * spread * side]
    const wave = (1 + Math.sin((t * 2 * Math.PI) / 1.6 + i * 1.3)) / 2
    const pulse = (1 + Math.sin((t * 2 * Math.PI) / 0.8 + i)) / 2
    const base = Math.min(1, c.strength * 1.35 * intensity)
    orb(at(-1), radius * (0.6 + 0.6 * wave), [255, 26, 38], base * (0.65 + 0.35 * wave))
    orb(at(1), radius * (0.6 + 0.6 * (1 - wave)), [26, 89, 255], base * (0.65 + 0.35 * (1 - wave)))
    orb(at(0), radius * (0.45 + 0.3 * pulse), [255, 255, 255], base * (0.75 + 0.25 * pulse))
  })
  ctx.globalCompositeOperation = 'source-over'
}

function orb([x, y], r, [R, G, B], a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  const c = (o) => `rgba(${R},${G},${B},${o})`
  g.addColorStop(0, c(a))
  g.addColorStop(0.3, c(a * 0.85))
  g.addColorStop(0.65, c(a * 0.35))
  g.addColorStop(1, c(0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

let lastTint = 0
function frame(now) {
  blink(Date.now())
  lights(now)
  // Turn the purple tint off when the special ability runs out.
  if (Date.now() - lastTint > 250) { lastTint = Date.now(); render() }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
