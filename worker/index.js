import {
  DEFAULT_ROOM_ID,
  MESSAGE,
  decodeMessage,
  encodeMessage,
  makeInputFrame,
  makeRoomSeed,
  normalizeRoomId,
} from '../public/src/shared/net/protocol.js';
import { generateCave, CaveProfile } from '../public/src/rules/geometry/caveGen.js';
import {
  SIM_DT,
  SIM_TICK_HZ,
  createArenaSimulation,
} from '../public/src/rules/sim/arenaSim.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const SNAPSHOT_HZ = 10;
const SERVER_TICK_MS = 1000 / SIM_TICK_HZ;
const SNAPSHOT_EVERY_TICKS = Math.max(1, Math.round(SIM_TICK_HZ / SNAPSHOT_HZ));

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
    this.createdAt = Date.now();
    this.roomId = DEFAULT_ROOM_ID;
    this.seed = makeRoomSeed(this.roomId);
    this.caveData = null;
    this.sim = null;
    this.tickTimer = null;
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
        tick: this.sim?.getTick() ?? 0,
        tickHz: SIM_TICK_HZ,
        snapshotHz: SNAPSHOT_HZ,
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

    this.ensureSim().addPlayer(peerId, this.sessions.size);
    this.sessions.set(socket, session);
    this.startTicking();
    this.send(socket, MESSAGE.WELCOME, {
      peerId,
      roomId: this.roomId,
      seed: this.seed,
      tickHz: SIM_TICK_HZ,
      snapshotHz: SNAPSHOT_HZ,
      peers: this.peerList(),
      snapshot: this.ensureSim().captureSnapshot(),
    });
    this.broadcast(MESSAGE.PEER_JOINED, { peerId, peers: this.peerList() }, socket);
    this.broadcastSnapshot();

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
      this.send(socket, MESSAGE.PONG, { tick: this.ensureSim().getTick() });
      return;
    }

    if (msg.type === MESSAGE.HELLO) {
      this.send(socket, MESSAGE.WELCOME, {
        peerId: session.id,
        roomId: this.roomId,
        seed: this.seed,
        tickHz: SIM_TICK_HZ,
        snapshotHz: SNAPSHOT_HZ,
        peers: this.peerList(),
        snapshot: this.ensureSim().captureSnapshot(),
      });
      return;
    }

    if (msg.type === MESSAGE.INPUT) {
      session.input = makeInputFrame(msg.input);
      this.ensureSim().setPlayerInput(session.id, session.input);
      return;
    }

    this.send(socket, MESSAGE.ERROR, { error: `unsupported message type: ${msg.type}` });
  }

  step() {
    const sim = this.ensureSim();
    const tick = sim.step(SIM_DT);

    if (tick % SNAPSHOT_EVERY_TICKS !== 0) return;
    this.broadcast(MESSAGE.SNAPSHOT, {
      snapshot: sim.captureSnapshot(),
    });
  }

  leave(socket) {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket);
    this.ensureSim().removePlayer(session.id);
    this.broadcast(MESSAGE.PEER_LEFT, {
      peerId: session.id,
      peers: this.peerList(),
    });
    this.broadcastSnapshot();
    if (this.sessions.size === 0) this.stopTicking();
  }

  peerList() {
    return [...this.sessions.values()].map((session) => ({
      id: session.id,
      joinedAt: session.joinedAt,
      lastSeenAt: session.lastSeenAt,
    }));
  }

  broadcastSnapshot() {
    this.broadcast(MESSAGE.SNAPSHOT, {
      snapshot: this.ensureSim().captureSnapshot(),
    });
  }

  setRoomId(roomId) {
    if (this.roomId === roomId) return;
    this.roomId = roomId;
    this.seed = makeRoomSeed(roomId);
    this.caveData = null;
    this.sim = null;
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

  ensureSim() {
    if (!this.sim) {
      const caveData = this.ensureCave();
      this.sim = createArenaSimulation({
        seed: this.seed,
        grid: caveData.grid,
        spawns: caveData.spawns,
      });
    }
    return this.sim;
  }

  startTicking() {
    if (this.tickTimer !== null) return;
    this.tickTimer = setTimeout(() => this.tickLoop(), SERVER_TICK_MS);
  }

  stopTicking() {
    if (this.tickTimer === null) return;
    clearTimeout(this.tickTimer);
    this.tickTimer = null;
  }

  tickLoop() {
    this.tickTimer = null;
    if (this.sessions.size === 0) return;

    try {
      this.step();
    } finally {
      if (this.sessions.size > 0) this.startTicking();
    }
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
