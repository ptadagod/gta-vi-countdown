// Local copy of the relay (see relay/src/index.js) built into the Vite dev server, so the
// overlay works while developing without Cloudflare. Same protocol: a WebSocket per room
// at /obs-api/room/<code>; each message is passed to the room's other sockets and kept as
// its latest state. A minimal WebSocket server is written out here to avoid a dependency.

import { createHash } from 'node:crypto'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export function obsRelay() {
  const rooms = new Map() // code -> { latest, sockets: Set }

  function room(code) {
    if (!rooms.has(code)) rooms.set(code, { latest: null, sockets: new Set() })
    return rooms.get(code)
  }

  function attach(httpServer) {
    httpServer?.on('upgrade', (req, socket) => {
      const code = req.url.match(/^\/obs-api\/room\/([a-z0-9]{3,32})$/)?.[1]
      if (!code) return // not ours (Vite's own hot-reload socket, for one)
      const key = req.headers['sec-websocket-key']
      if (!key) return socket.destroy()
      const accept = createHash('sha1').update(key + GUID).digest('base64')
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
      socket.setNoDelay(true)

      const r = room(code)
      const peer = { send: (text) => socket.write(frame(1, Buffer.from(text))) }
      r.sockets.add(peer)
      if (r.latest) peer.send(r.latest)

      let buf = Buffer.alloc(0)
      let parts = []
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk])
        for (;;) {
          const f = parse(buf)
          if (!f) break
          buf = buf.subarray(f.size)
          if (f.opcode === 8) { socket.end(frame(8, Buffer.alloc(0))); return }
          if (f.opcode === 9) { socket.write(frame(10, f.data)); continue }
          if (f.opcode === 1 || f.opcode === 0) {
            parts.push(f.data)
            if (!f.fin) continue
            const text = Buffer.concat(parts).toString('utf8')
            parts = []
            try {
              if (JSON.parse(text)?.type !== 'state') continue
            } catch { continue }
            r.latest = text
            for (const other of r.sockets) if (other !== peer) other.send(text)
          }
        }
      })
      const drop = () => r.sockets.delete(peer)
      socket.on('close', drop)
      socket.on('error', drop)
    })
  }

  return {
    name: 'obs-relay',
    configureServer(server) { attach(server.httpServer) },
    configurePreviewServer(server) { attach(server.httpServer) },
  }
}

function parse(buf) {
  if (buf.length < 2) return null
  const fin = (buf[0] & 0x80) !== 0
  const opcode = buf[0] & 0x0f
  const masked = (buf[1] & 0x80) !== 0
  let len = buf[1] & 0x7f
  let at = 2
  if (len === 126) {
    if (buf.length < 4) return null
    len = buf.readUInt16BE(2)
    at = 4
  } else if (len === 127) {
    if (buf.length < 10) return null
    len = Number(buf.readBigUInt64BE(2))
    at = 10
  }
  const mask = masked ? buf.subarray(at, at + 4) : null
  if (masked) at += 4
  if (buf.length < at + len) return null
  const data = Buffer.from(buf.subarray(at, at + len))
  if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3]
  return { fin, opcode, data, size: at + len }
}

function frame(opcode, data) {
  const len = data.length
  const head = len < 126 ? Buffer.from([0x80 | opcode, len])
    : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255])
    : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); return h })()
  return Buffer.concat([head, data])
}
