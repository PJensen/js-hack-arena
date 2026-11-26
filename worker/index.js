import {
  ACCOUNT_ALREADY_PLAYING,
  DEFAULT_ROOM_ID,
  MAX_SAY_LENGTH,
  MESSAGE,
  decodeMessage,
  encodeMessage,
  makeInputFrame,
  makeRoomSeed,
  normalizePlayerName,
  normalizeRoomId,
  normalizeSayText,
} from '../public/src/shared/net/protocol.js';
import { generateArenaCave } from '../public/src/rules/geometry/caveGen.js';
import { Gold, MaterialStacks } from '../public/src/rules/components/index.js';
import { CampAction, checkCampAction } from '../public/src/rules/camp.js';
import { SIM_DT, SIM_TICK_HZ } from '../public/src/rules/sim/arenaSim.js';
import { createArenaDungeonSimulation } from '../public/src/rules/sim/arenaDungeon.js';
import {
  authCallback,
  authConfigStatus,
  authLogin,
  authLogout,
  authMe,
  createRoomHandoff,
  readSession,
  verifyRoomHandoff,
} from './auth.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const SNAPSHOT_HZ = 10;
const SERVER_TICK_MS = 1000 / SIM_TICK_HZ;
const SNAPSHOT_EVERY_TICKS = Math.max(1, Math.round(SIM_TICK_HZ / SNAPSHOT_HZ));
const SAY_COOLDOWN_MS = 900;
const PENDING_GOLD_PREFIX = 'pending-character-gold:';
const PENDING_MATERIALS_PREFIX = 'pending-character-materials:';
const CREDIT_RETRY_MS = 2000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/auth/login') {
      try { return await authLogin(request, env); }
      catch (error) { return json({ ok: false, error: error.message }, { status: 503 }); }
    }
    if (url.pathname === '/auth/callback') {
      try { return await authCallback(request, env); }
      catch (error) { return json({ ok: false, error: error.message }, { status: 502 }); }
    }
    if (url.pathname === '/auth/me') return authMe(request, env);
    if (url.pathname === '/auth/logout' && (request.method === 'POST' || request.method === 'GET')) return authLogout();

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        service: 'js-hack-arena',
        runtime: 'cloudflare-worker',
        auth: authConfigStatus(env),
      });
    }

    if (url.pathname === '/api/rooms/default') {
      const session = await readSession(request, env);
      if (!session) return json({ ok: false, error: 'login required' }, { status: 401 });
      const roomId = normalizeRoomId(url.searchParams.get('room') ?? DEFAULT_ROOM_ID);
      return json({
        roomId,
        seed: makeRoomSeed(roomId),
        ws: websocketUrl(request, `/ws/${roomId}`),
      });
    }

    if (url.pathname === '/api/character' && request.method === 'GET') {
      const session = await readSession(request, env);
      if (!session) return json({ ok: false, error: 'login required' }, { status: 401 });
      const roomId = normalizeRoomId(url.searchParams.get('room') ?? DEFAULT_ROOM_ID);
      return json(await env.GAME_ROOM.getByName(roomId).readCharacterProgress(session.sub));
    }

    const roomPath = /^\/ws\/([a-z0-9_-]{1,48})$/.exec(url.pathname);
    if (roomPath) {
      const roomId = normalizeRoomId(roomPath[1]);
      const session = await readSession(request, env);
      if (!session) return json({ ok: false, error: 'login required' }, { status: 401 });
      const handoff = await createRoomHandoff(session, roomId, url.searchParams.get('characterName'), env);
      const headers = new Headers(request.headers);
      headers.set('x-arena-room-auth', handoff);
      return env.GAME_ROOM.getByName(roomId).fetch(new Request(request, { headers }));
    }

    return env.ASSETS.fetch(request);
  },
};

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.goldFlushes = new Map();
    this.materialFlushes = new Map();
    this.createdAt = Date.now();
    this.roomId = state.id.name ?? DEFAULT_ROOM_ID;
    this.seed = makeRoomSeed(this.roomId);
    this.caveData = null;
    this.sim = null;
    this.tickTimer = null;
  }

  async fetch(request) {
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

    const identity = await verifyRoomHandoff(request.headers.get('x-arena-room-auth'), this.roomId, this.env);
    if (!identity) return json({ ok: false, error: 'room authentication required' }, { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (!await this.accept(server, identity)) {
      // Browsers cannot read the HTTP response body of a rejected WebSocket upgrade.
      server.accept();
      server.close(ACCOUNT_ALREADY_PLAYING, 'Account already playing');
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async accept(socket, identity) {
    const { userId } = identity;
    const alreadyPlaying = () => [...this.sessions.values()].some((session) => session.userId === userId);
    if (alreadyPlaying()) return false;
    const { gold } = await this.readCharacterProgress(userId);
    if (alreadyPlaying()) return false;
    socket.accept();

    const peerId = crypto.randomUUID();
    const session = {
      id: peerId,
      socket,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      nextSayAt: 0,
      input: makeInputFrame(),
      name: normalizePlayerName(identity.displayName),
      userId,
      gold,
    };

    const sim = this.ensureSim();
    const player = sim.addPlayer(peerId, this.sessions.size, null, session.name);
    sim.world.get(player, Gold).count = gold;
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
    return true;
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

    if (msg.type === MESSAGE.SAY) {
      const text = normalizeSayText(msg.text);
      if (!text) {
        this.send(socket, MESSAGE.SAY_ERROR, { error: `Enter a message up to ${MAX_SAY_LENGTH} characters.` });
      } else if (session.lastSeenAt < session.nextSayAt) {
        this.send(socket, MESSAGE.SAY_ERROR, { error: 'Wait a moment before sending again.' });
      } else {
        session.nextSayAt = session.lastSeenAt + SAY_COOLDOWN_MS;
        this.broadcast(MESSAGE.SAY, { peerId: session.id, name: session.name, text });
      }
      return;
    }

    if (msg.type === MESSAGE.CAMP_ACTION) {
      return this.handleCampAction(session, msg.action);
    }

    this.send(socket, MESSAGE.ERROR, { error: `unsupported message type: ${msg.type}` });
  }

  step() {
    const sim = this.ensureSim();
    const tick = sim.step(SIM_DT);

    for (const session of this.sessions.values()) {
      const gold = sim.world.get(sim.getPlayerEntity(session.id), Gold);
      const earned = gold.count - session.gold;
      if (earned <= 0) continue;
      this.queueGold(session.userId, earned);
      // Publish only balances confirmed by the character store.
      gold.count = session.gold;
    }

    if (tick % SNAPSHOT_EVERY_TICKS !== 0) return;
    this.broadcast(MESSAGE.SNAPSHOT, {
      snapshot: sim.captureSnapshot(),
    });
  }

  legacyGold(userId) {
    if (this.roomId !== DEFAULT_ROOM_ID) throw new Error('Legacy progress belongs to the lobby');
    return this.state.storage.kv.get(`player-progress:${userId}`)?.gold ?? 0;
  }

  async readCharacterProgress(userId) {
    await Promise.all([this.flushGold(userId), this.flushMaterials(userId)]);
    const character = this.env.CHARACTER.getByName(userId);
    const existing = await character.read();
    if (existing) return existing;
    const legacyGold = this.roomId === DEFAULT_ROOM_ID ? this.legacyGold(userId)
      : await this.env.GAME_ROOM.getByName(DEFAULT_ROOM_ID).legacyGold(userId);
    return character.initialize(legacyGold);
  }

  handleCampAction(session, action) {
    const { userId, socket } = session;
    const { grid, camp } = this.ensureCave();
    const sim = this.ensureSim();
    const player = sim.getPlayerEntity(session.id);
    const pendingKey = PENDING_MATERIALS_PREFIX + userId;
    const { storage } = this.state;
    const pending = storage.kv.get(pendingKey) !== undefined;
    const error = checkCampAction({ world: sim.world, player, grid, camp, action, pending });
    if (error) {
      this.send(socket, MESSAGE.CAMP_RESULT, { action, error, pending });
      return;
    }
    if (action === CampAction.EXIT) {
      this.leave(socket);
      this.send(socket, MESSAGE.CAMP_RESULT, { action });
      return;
    }

    const stacks = sim.world.get(player, MaterialStacks);
    const deposited = stacks.counts;
    const earnedKey = `character-materials-earned:${userId}`;
    this.state.waitUntil(storage.setAlarm(Date.now() + CREDIT_RETRY_MS));
    try {
      storage.transactionSync(() => {
        const earned = storage.kv.get(earnedKey) ?? {};
        for (const [id, count] of Object.entries(deposited)) {
          const total = (earned[id] ?? 0) + count;
          if (!Number.isSafeInteger(total)) throw new Error('Room material credit exceeds the safe integer limit');
          earned[id] = total;
        }
        storage.kv.put(earnedKey, earned);
        storage.kv.put(pendingKey, { earned, deposited });
      });
    } catch (error) {
      console.error('Could not queue material deposit', error);
      this.send(socket, MESSAGE.CAMP_RESULT, { action, error: 'Could not save your deposit. Try again.' });
      return;
    }
    stacks.counts = {};
    const flush = this.flushMaterials(userId).catch((error) => {
      console.error('Character material credit deferred', error);
      this.send(socket, MESSAGE.CAMP_RESULT, { action, error: 'Deposit is saving. Try the portal again shortly.', pending: true });
    });
    this.state.waitUntil(flush);
    return flush;
  }

  flushMaterials(userId) {
    const inFlight = this.materialFlushes.get(userId);
    if (inFlight) return inFlight;
    const key = PENDING_MATERIALS_PREFIX + userId;
    const { kv } = this.state.storage;
    const pending = kv.get(key);
    if (!pending) return Promise.resolve();
    const flush = Promise.resolve().then(async () => {
      await this.env.CHARACTER.getByName(userId).creditMaterials(this.state.id.toString(), pending.earned);
      kv.delete(key);
      const session = [...this.sessions.values()].find((player) => player.userId === userId);
      if (session) {
        this.send(session.socket, MESSAGE.CAMP_RESULT, { action: CampAction.DEPOSIT, deposited: pending.deposited });
      }
    }).finally(() => this.materialFlushes.delete(userId));
    this.materialFlushes.set(userId, flush);
    return flush;
  }

  queueGold(userId, amount) {
    const { storage } = this.state;
    const earnedKey = `character-gold-earned:${userId}`;
    const pendingKey = PENDING_GOLD_PREFIX + userId;
    // Schedule recovery before publishing the durable credit. The alarm also
    // runs if the room loses its sockets while an RPC is in flight.
    if (storage.kv.get(pendingKey) === undefined) {
      this.state.waitUntil(storage.setAlarm(Date.now() + CREDIT_RETRY_MS));
    }
    storage.transactionSync(() => {
      const earned = (storage.kv.get(earnedKey) ?? 0) + amount;
      if (!Number.isSafeInteger(earned)) throw new Error('Room gold credit exceeds the safe integer limit');
      storage.kv.put(earnedKey, earned);
      storage.kv.put(pendingKey, earned);
    });
    this.state.waitUntil(this.flushGold(userId).catch((error) => console.error('Character gold credit deferred', error)));
  }

  flushGold(userId) {
    const inFlight = this.goldFlushes.get(userId);
    if (inFlight) return inFlight;
    const key = PENDING_GOLD_PREFIX + userId;
    const sync = async () => {
      const { kv } = this.state.storage;
      let earned;
      while ((earned = kv.get(key)) !== undefined) {
        const gold = await this.env.CHARACTER.getByName(userId).creditGold(this.state.id.toString(), earned);
        if (kv.get(key) === earned) kv.delete(key);
        const session = [...this.sessions.values()].find((player) => player.userId === userId);
        if (session) {
          session.gold = gold;
          const sim = this.ensureSim();
          sim.world.get(sim.getPlayerEntity(session.id), Gold).count = gold;
        }
      }
    };
    const flush = sync().finally(() => this.goldFlushes.delete(userId));
    this.goldFlushes.set(userId, flush);
    return flush;
  }

  async alarm() {
    const { storage } = this.state;
    const gold = [...storage.kv.list({ prefix: PENDING_GOLD_PREFIX })];
    const materials = [...storage.kv.list({ prefix: PENDING_MATERIALS_PREFIX })];
    // Keep a retry scheduled until every pending credit is acknowledged.
    if (gold.length === 0 && materials.length === 0) return;
    await storage.setAlarm(Date.now() + CREDIT_RETRY_MS);
    await Promise.all([
      ...gold.map(([key]) => this.flushGold(key.slice(PENDING_GOLD_PREFIX.length))),
      ...materials.map(([key]) => this.flushMaterials(key.slice(PENDING_MATERIALS_PREFIX.length))),
    ]);
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
      name: session.name,
    }));
  }

  broadcastSnapshot() {
    this.broadcast(MESSAGE.SNAPSHOT, {
      snapshot: this.ensureSim().captureSnapshot(),
    });
  }

  ensureCave() {
    if (!this.caveData) {
      this.caveData = generateArenaCave(this.seed);
    }
    return this.caveData;
  }

  ensureSim() {
    if (!this.sim) {
      this.sim = createArenaDungeonSimulation({
        seed: this.seed,
        cave: this.ensureCave(),
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
