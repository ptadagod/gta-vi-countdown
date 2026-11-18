// Twitch chat for the HUD overlay, read anonymously (no login or token needed).
// Messages slide in at the bottom right and fade out after a while. Messages a mod
// deletes, and users who get timed out or banned, disappear from the overlay too.

const MAX = 7 // messages on screen at once
const LIFE_MS = 45000 // how long each message stays
const EMOTE = (id) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`

const box = document.querySelector('.chat')
let socket = null
let channel = ''
let retry = 1000

const esc = (t) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Message text with Twitch emotes swapped for images. */
function withEmotes(text, emotes) {
  const chars = [...text] // emote positions count code points
  const spans = []
  for (const part of (emotes || '').split('/').filter(Boolean)) {
    const [id, ranges] = part.split(':')
    for (const r of ranges.split(',')) {
      const [a, b] = r.split('-').map(Number)
      spans.push([a, b, id])
    }
  }
  spans.sort((x, y) => x[0] - y[0])
  let out = ''
  let i = 0
  for (const [a, b, id] of spans) {
    out += esc(chars.slice(i, a).join(''))
    out += `<img class="emote" src="${EMOTE(id)}" alt="${esc(chars.slice(a, b + 1).join(''))}">`
    i = b + 1
  }
  return out + esc(chars.slice(i).join(''))
}

/** Twitch picks dark colours for some names; lift them so they read on the dark box. */
function nameColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return '#edb8cc'
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return light < 0.45 ? `color-mix(in srgb, ${hex} 45%, white)` : hex
}

function add(tags, text) {
  if (text.startsWith('\u0001ACTION ')) text = text.slice(8, -1) // /me
  const el = document.createElement('div')
  el.className = 'msg'
  el.dataset.id = tags.id || ''
  el.dataset.user = tags['user-id'] || ''
  const name = tags['display-name'] || 'viewer'
  el.innerHTML = `<b style="color:${nameColor(tags.color)}">${esc(name)}</b><span>${withEmotes(text, tags.emotes)}</span>`
  box.append(el)
  requestAnimationFrame(() => el.classList.add('in'))
  while (box.children.length > MAX) box.firstElementChild.remove()
  setTimeout(() => remove(el), LIFE_MS)
}

function remove(el) {
  if (!el.isConnected || el.classList.contains('out')) return
  el.classList.add('out')
  setTimeout(() => el.remove(), 400)
}

function parse(line) {
  const tags = {}
  if (line.startsWith('@')) {
    const sp = line.indexOf(' ')
    for (const kv of line.slice(1, sp).split(';')) {
      const [k, v = ''] = kv.split('=')
      tags[k] = v.replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\')
    }
    line = line.slice(sp + 1)
  }
  const trail = line.indexOf(' :', 1)
  const text = trail >= 0 ? line.slice(trail + 2) : ''
  const words = (trail >= 0 ? line.slice(0, trail) : line).split(' ')
  const cmd = words[0].startsWith(':') ? words[1] : words[0]
  return { tags, cmd, text }
}

function onLine(line) {
  const { tags, cmd, text } = parse(line)
  if (cmd === 'PING') socket.send(`PONG :${text || 'tmi.twitch.tv'}`)
  else if (cmd === 'PRIVMSG') add(tags, text)
  else if (cmd === 'CLEARMSG') box.querySelectorAll(`.msg[data-id="${CSS.escape(tags['target-msg-id'] || '')}"]`).forEach(remove)
  else if (cmd === 'CLEARCHAT') {
    const who = tags['target-user-id']
    box.querySelectorAll(who ? `.msg[data-user="${CSS.escape(who)}"]` : '.msg').forEach(remove)
  }
}

function connect() {
  if (!channel) return
  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
  socket = ws
  ws.onopen = () => {
    retry = 1000
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
    ws.send('PASS SCHMOOPIIE')
    ws.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`)
    ws.send(`JOIN #${channel}`)
  }
  ws.onmessage = (e) => String(e.data).split('\r\n').filter(Boolean).forEach(onLine)
  ws.onclose = () => {
    if (socket !== ws) return // replaced by a new channel
    socket = null
    setTimeout(connect, retry)
    retry = Math.min(retry * 2, 30000)
  }
}

/** Shows chat from this Twitch channel ('' for none). Safe to call on every render. */
export function setChatChannel(name) {
  const next = (name || '').trim().toLowerCase().replace(/^#/, '')
  if (!/^[a-z0-9_]{0,25}$/.test(next) || next === channel) return
  channel = next
  const old = socket
  socket = null
  old?.close()
  box.innerHTML = ''
  connect()
}
