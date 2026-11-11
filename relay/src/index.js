// Relay for the OBS HUD overlay. Each streamer has a private room code; their control
// panel and overlay sources join that room over a WebSocket, and whatever one of them
// sends is passed to the others and kept as the room's latest state.
//
// One Durable Object per room. Sockets use the hibernation API, so an idle stream
// costs nothing while it waits for the next click.

import { DurableObject } from 'cloudflare:workers'

const MAX_MESSAGE = 512 * 1024 // a long route is ~150 KB

export class Room extends DurableObject {
  async fetch() {
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    const latest = await this.ctx.storage.get('state')
    if (latest) server.send(latest)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) return
    let msg
    try { msg = JSON.parse(message) } catch { return }
    if (msg?.type !== 'state' || typeof msg.state !== 'object') return
    await this.ctx.storage.put('state', message)
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) {
        try { other.send(message) } catch { /* closing */ }
      }
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'bye') } catch { /* already closed */ }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const room = url.pathname.match(/^\/room\/([a-z0-9]{8,32})$/)?.[1]
    if (!room) {
      return new Response(url.pathname === '/' ? 'HUD overlay relay is running.' : 'Not found', {
        status: url.pathname === '/' ? 200 : 404,
      })
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 })
    }
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request)
  }
}
