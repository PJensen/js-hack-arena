import {
  DEFAULT_ROOM_ID,
  MESSAGE,
  decodeMessage,
  encodeMessage,
  makeInputFrame,
  makePlayerState,
  makeRoomSeed,
  normalizeRoomId,
} from '../public/src/shared/net/protocol.js';
import { generateCave, CaveProfile } from '../public/src/rules/geometry/caveGen.js';
import { moveWithSlide } from '../public/src/rules/geometry/sweep.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 200;
const PLAYER_HP = 100;
const MAX_STEP_DT = 0.1;

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
        seed: makeRoomSeed(roomId),
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
    this.roomId = DEFAULT_ROOM_ID;
    this.seed = makeRoomSeed(this.roomId);
    this.caveData = null;
    this.lastStepAt = Date.now();
  }

  async fetch(request) {
    const url = new URL(request.url);
    this.setRoomId(normalizeRoomId(url.pathname.startsWith('/ws/') ? url.pathname.slice('/ws/'.length) : DEFAULT_ROOM_ID));

    if (request.headers.get('upgrade') !== 'websocket') {
      return json({
        ok: true,
        roomId: this.roomId,
        room: this.state.id.toString(),
        seed: this.seed,
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
    const spawn = this.spawnForPeer(this.sessions.size);
    const session = {
      id: peerId,
      socket,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      input: makeInputFrame(),
      state: makePlayerState({
        x: spawn.x,
        y: spawn.y,
        facing: 0,
        hp: PLAYER_HP,
        maxHp: PLAYER_HP,
      }),
    };

    this.sessions.set(socket, session);
    this.send(socket, MESSAGE.WELCOME, {
      peerId,
      roomId: this.roomId,
      seed: this.seed,
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
        roomId: this.roomId,
        seed: this.seed,
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
    const now = Date.now();
    const dt = Math.min(MAX_STEP_DT, Math.max(0, (now - this.lastStepAt) / 1000));
    this.lastStepAt = now;
    this.tick += 1;

    if (dt > 0) {
      const { grid } = this.ensureCave();
      for (const session of this.sessions.values()) {
        const state = session.state;
        const input = session.input;
        const dx = input.moveX * PLAYER_SPEED * dt;
        const dy = input.moveY * PLAYER_SPEED * dt;

        if (Math.abs(input.aimX) > 0.1 || Math.abs(input.aimY) > 0.1) {
          state.facing = Math.atan2(input.aimY, input.aimX);
        } else if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
          state.facing = Math.atan2(dy, dx);
        }

        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
          const moved = moveWithSlide(grid, state.x, state.y, dx, dy, PLAYER_RADIUS);
          state.x = moved.x;
          state.y = moved.y;
        }
      }
    }

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
      state: session.state,
    }));
  }

  setRoomId(roomId) {
    if (this.roomId === roomId) return;
    this.roomId = roomId;
    this.seed = makeRoomSeed(roomId);
    this.caveData = null;
    this.lastStepAt = Date.now();
  }

  ensureCave() {
    if (!this.caveData) {
      this.caveData = generateCave({
        seed: this.seed,
        width: 2000,
        height: 2000,
        profile: CaveProfile.CAVERNS,
        spawnCount: 4,
      });
    }
    return this.caveData;
  }

  spawnForPeer(peerIndex) {
    const { spawns } = this.ensureCave();
    return spawns[peerIndex % spawns.length] || { x: 1000, y: 1000 };
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
