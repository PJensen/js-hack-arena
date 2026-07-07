import {
  DEFAULT_ROOM_ID,
  MESSAGE,
  decodeMessage,
  encodeMessage,
  makeInputFrame,
  normalizeRoomId,
} from '../public/src/net/protocol.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        service: 'js-hack-arena',
        runtime: 'cloudflare-worker',
      });
    }

    if (url.pathname === '/api/rooms/default') {
      const roomId = normalizeRoomId(url.searchParams.get('room') || DEFAULT_ROOM_ID);
      return json({
        roomId,
        ws: websocketUrl(request, `/ws/${roomId}`),
      });
    }

    if (url.pathname.startsWith('/ws/')) {
      const roomId = normalizeRoomId(url.pathname.slice('/ws/'.length));
      const id = env.GAME_ROOM.idFromName(roomId);
      return env.GAME_ROOM.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.tick = 0;
    this.createdAt = Date.now();
  }

  async fetch(request) {
    if (request.headers.get('upgrade') !== 'websocket') {
      return json({
        ok: true,
        room: this.state.id.toString(),
        peers: this.sessions.size,
        tick: this.tick,
      });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.accept(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  accept(socket) {
    socket.accept();

    const peerId = crypto.randomUUID();
    const session = {
      id: peerId,
      socket,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      input: makeInputFrame(),
    };

    this.sessions.set(socket, session);
    this.send(socket, MESSAGE.WELCOME, {
      peerId,
      tick: this.tick,
      peers: this.peerList(),
    });
    this.broadcast(MESSAGE.PEER_JOINED, { peerId, peers: this.peerList() }, socket);

    socket.addEventListener('message', (event) => {
      this.handleMessage(socket, event.data);
    });
    socket.addEventListener('close', () => {
      this.leave(socket);
    });
    socket.addEventListener('error', () => {
      this.leave(socket);
    });
  }

  handleMessage(socket, raw) {
    const session = this.sessions.get(socket);
    if (!session) return;

    let msg;
    try {
      msg = decodeMessage(raw);
    } catch (err) {
      this.send(socket, MESSAGE.ERROR, { error: err.message });
      return;
    }

    session.lastSeenAt = Date.now();

    if (msg.type === MESSAGE.PING) {
      this.send(socket, MESSAGE.PONG, { tick: this.tick });
      return;
    }

    if (msg.type === MESSAGE.HELLO) {
      this.send(socket, MESSAGE.WELCOME, {
        peerId: session.id,
        tick: this.tick,
        peers: this.peerList(),
      });
      return;
    }

    if (msg.type === MESSAGE.INPUT) {
      session.input = makeInputFrame(msg.input);
      this.step();
      return;
    }

    this.send(socket, MESSAGE.ERROR, { error: `unsupported message type: ${msg.type}` });
  }

  step() {
    this.tick += 1;

    this.broadcast(MESSAGE.SNAPSHOT, {
      tick: this.tick,
      peers: this.peerList(),
    });
  }

  leave(socket) {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket);
    this.broadcast(MESSAGE.PEER_LEFT, {
      peerId: session.id,
      peers: this.peerList(),
    });
  }

  peerList() {
    return [...this.sessions.values()].map((session) => ({
      id: session.id,
      joinedAt: session.joinedAt,
      lastSeenAt: session.lastSeenAt,
      input: session.input,
    }));
  }

  send(socket, type, payload) {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(encodeMessage(type, payload));
  }

  broadcast(type, payload, except = null) {
    for (const socket of this.sessions.keys()) {
      if (socket !== except) this.send(socket, type, payload);
    }
  }
}

function websocketUrl(request, pathname) {
  const url = new URL(request.url);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = pathname;
  url.search = '';
  return url.toString();
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers || {}),
    },
  });
}
