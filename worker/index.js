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
const PLAYER_FIRE_COOLDOWN = 0.25;
const PROJECTILE_SPEED = 320;
const PROJECTILE_RADIUS = 5;
const PROJECTILE_DAMAGE = 15;
const PROJECTILE_TTL = 2.0;
const MOB_RADIUS = 12;
const MOB_HP = 60;
const SERVER_TICK_HZ = 20;
const SNAPSHOT_HZ = 10;
const SERVER_TICK_MS = 1000 / SERVER_TICK_HZ;
const SERVER_DT = 1 / SERVER_TICK_HZ;
const SNAPSHOT_EVERY_TICKS = Math.max(1, Math.round(SERVER_TICK_HZ / SNAPSHOT_HZ));

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
    this.mobs = [];
    this.projectiles = [];
    this.nextEntityId = 1;
    this.nextEventId = 1;
    this.events = [];
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
        tick: this.tick,
        tickHz: SERVER_TICK_HZ,
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
    const spawn = this.spawnForPeer(this.sessions.size);
    const session = {
      id: peerId,
      socket,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      input: makeInputFrame(),
      fireCooldown: 0,
      state: makePlayerState({
        x: spawn.x,
        y: spawn.y,
        facing: 0,
        hp: PLAYER_HP,
        maxHp: PLAYER_HP,
      }),
    };

    this.sessions.set(socket, session);
    this.startTicking();
    this.send(socket, MESSAGE.WELCOME, {
      peerId,
      roomId: this.roomId,
      seed: this.seed,
      tick: this.tick,
      tickHz: SERVER_TICK_HZ,
      snapshotHz: SNAPSHOT_HZ,
      peers: this.peerList(),
      entities: this.entitySnapshot(),
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
        tickHz: SERVER_TICK_HZ,
        snapshotHz: SNAPSHOT_HZ,
        peers: this.peerList(),
        entities: this.entitySnapshot(),
      });
      return;
    }

    if (msg.type === MESSAGE.INPUT) {
      session.input = makeInputFrame(msg.input);
      return;
    }

    this.send(socket, MESSAGE.ERROR, { error: `unsupported message type: ${msg.type}` });
  }

  step() {
    this.tick += 1;

    const { grid } = this.ensureCave();
    for (const session of this.sessions.values()) {
      const state = session.state;
      const input = session.input;
      const dx = input.moveX * PLAYER_SPEED * SERVER_DT;
      const dy = input.moveY * PLAYER_SPEED * SERVER_DT;
      session.fireCooldown = Math.max(0, session.fireCooldown - SERVER_DT);

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

      this.tryFire(session);
    }

    this.stepProjectiles(grid);

    if (this.tick % SNAPSHOT_EVERY_TICKS !== 0) return;
    this.broadcast(MESSAGE.SNAPSHOT, {
      tick: this.tick,
      peers: this.peerList(),
      entities: this.entitySnapshot(),
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
    if (this.sessions.size === 0) this.stopTicking();
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
    this.mobs = [];
    this.projectiles = [];
    this.nextEntityId = 1;
    this.nextEventId = 1;
    this.events = [];
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
      this.spawnMobs();
    }
    return this.caveData;
  }

  spawnForPeer(peerIndex) {
    const { spawns } = this.ensureCave();
    return spawns[peerIndex % spawns.length] || { x: 1000, y: 1000 };
  }

  spawnMobs() {
    this.mobs = [];
    const { grid, spawns } = this.caveData;
    const anchors = spawns.length > 0 ? spawns : [{ x: 1000, y: 1000 }];
    for (let i = 0; i < Math.min(4, anchors.length); i++) {
      const anchor = anchors[i];
      const pos = findOpenNear(grid, anchor.x + 200, anchor.y + 150, 400);
      this.mobs.push({
        id: `m${this.nextEntityId++}`,
        kind: 'mob',
        glyph: 'W',
        x: pos.x,
        y: pos.y,
        facing: 0,
        radius: MOB_RADIUS,
        hp: MOB_HP,
        maxHp: MOB_HP,
      });
    }
  }

  tryFire(session) {
    const input = session.input;
    const aiming = Math.abs(input.aimX) > 0.1 || Math.abs(input.aimY) > 0.1;
    if (!aiming || !input.fire || session.fireCooldown > 0) return;

    session.fireCooldown = PLAYER_FIRE_COOLDOWN;
    const angle = Math.atan2(input.aimY, input.aimX);
    session.state.facing = angle;
    this.projectiles.push({
      id: `p${this.nextEntityId++}`,
      kind: 'projectile',
      owner: session.id,
      x: session.state.x + Math.cos(angle) * 20,
      y: session.state.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * PROJECTILE_SPEED,
      vy: Math.sin(angle) * PROJECTILE_SPEED,
      radius: PROJECTILE_RADIUS,
      damage: PROJECTILE_DAMAGE,
      ttl: PROJECTILE_TTL,
      trailColor: '#8cd8ff',
      burstColor: '#b0e0ff',
    });
    this.emitEvent({
      type: 'projectile.spawned',
      id: this.projectiles[this.projectiles.length - 1].id,
      x: session.state.x + Math.cos(angle) * 20,
      y: session.state.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * PROJECTILE_SPEED,
      vy: Math.sin(angle) * PROJECTILE_SPEED,
      color: '#8cd8ff',
    });
  }

  stepProjectiles(grid) {
    const liveProjectiles = [];
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx * SERVER_DT;
      projectile.y += projectile.vy * SERVER_DT;
      projectile.ttl -= SERVER_DT;

      if (projectile.ttl <= 0) continue;
      if (grid.distanceMove(projectile.x, projectile.y) < projectile.radius) {
        this.emitEvent({
          type: 'projectile.destroyed',
          reason: 'wall',
          id: projectile.id,
          x: projectile.x,
          y: projectile.y,
          color: projectile.burstColor,
        });
        continue;
      }

      let hit = false;
      for (const mob of this.mobs) {
        if (mob.hp <= 0) continue;
        const dx = mob.x - projectile.x;
        const dy = mob.y - projectile.y;
        const minDist = mob.radius + projectile.radius;
        if (dx * dx + dy * dy >= minDist * minDist) continue;

        mob.hp = Math.max(0, mob.hp - projectile.damage);
        this.emitEvent({
          type: 'projectile.destroyed',
          reason: 'hit',
          id: projectile.id,
          targetId: mob.id,
          x: projectile.x,
          y: projectile.y,
          color: projectile.burstColor,
        });
        if (mob.hp <= 0) {
          this.emitEvent({
            type: 'mob.died',
            id: mob.id,
            x: mob.x,
            y: mob.y,
            glyph: mob.glyph,
          });
        }
        hit = true;
        break;
      }
      if (!hit) liveProjectiles.push(projectile);
    }

    this.projectiles = liveProjectiles;
    this.mobs = this.mobs.filter((mob) => mob.hp > 0);
  }

  entitySnapshot() {
    return {
      mobs: this.mobs.map((mob) => ({ ...mob })),
      projectiles: this.projectiles.map((projectile) => ({ ...projectile })),
      events: this.events.slice(-32),
    };
  }

  emitEvent(event) {
    this.events.push({
      eventId: this.nextEventId++,
      tick: this.tick,
      ...event,
    });
    if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
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

function findOpenNear(grid, x, y, searchRadius = 200) {
  for (let r = 0; r < searchRadius; r += 8) {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const tx = x + Math.cos(a) * r;
      const ty = y + Math.sin(a) * r;
      if (grid.distanceMove(tx, ty) >= 20) return { x: tx, y: ty };
    }
  }
  return { x, y };
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
