import { assert, assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { AI, Actor, Conditions, Health, Position } from '../public/src/rules/components/index.js';
import { SIM_DT, SIM_MODE, createArenaSimulation } from '../public/src/rules/sim/arenaSim.js';
import { GAZE_CHARGE_SECONDS } from '../public/src/rules/components/AI.js';
import { sweepMaxFree } from '../public/src/rules/geometry/sweep.js';
import { applyDamage } from '../public/src/rules/effects.js';
import { spawnGold, spawnRing } from '../public/src/rules/spawner.js';
import { MESSAGE, decodeMessage, encodeMessage } from '../public/src/shared/net/protocol.js';
import { GameRoom } from '../worker/index.js';

class FakeSocket {
  readyState = WebSocket.OPEN;
  sent = [];
  listeners = new Map();

  accept() {}
  send(raw) { this.sent.push(decodeMessage(raw)); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
}

function makeRoomState(kv = new Map()) {
  return {
    id: { toString: () => 'test-room' },
    storage: {
      kv: {
        get: (key) => structuredClone(kv.get(key)),
        put: (key, value) => kv.set(key, structuredClone(value)),
      },
    },
  };
}

Deno.test('game room: every connected socket receives both players immediately', () => {
  const room = new GameRoom(makeRoomState(), {});
  const first = new FakeSocket();
  const second = new FakeSocket();

  room.accept(first, { userId: 'user-1', displayName: 'First' });
  const beforeJoin = latestSnapshot(first);
  room.accept(second, { userId: 'user-2', displayName: 'Second' });
  const firstView = latestSnapshot(first);
  const secondView = latestSnapshot(second);

  assert(firstView.revision > beforeJoin.revision);
  assertEquals(firstView.tick, beforeJoin.tick);
  assertEquals(firstView.entities.filter((entity) => entity.kind === 'player').length, 2);
  assertEquals(secondView.entities.filter((entity) => entity.kind === 'player').length, 2);
  assertEquals(secondView.entities.filter(({ state }) => state.slot === 'ring').length, 1);

  room.leave(first);
  room.leave(second);
});

Deno.test('game room: encounters stay spread out while some mobs patrol', () => {
  const room = new GameRoom(makeRoomState(), {});
  const socket = new FakeSocket();
  room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const cave = room.ensureCave();
    const [entrance] = cave.spawns;
    const sim = room.ensureSim();
    const offline = createArenaSimulation({ ...cave, seed: room.seed, enemyGroupSize: 3 });
    offline.addPlayer('offline');
    const mobStates = (snapshot) => snapshot.entities.filter(({ kind }) => kind === 'mob').map(({ state }) => state);
    assertEquals(mobStates(latestSnapshot(socket)), mobStates(offline.captureSnapshot()));
    assertEquals(mobStates(latestSnapshot(socket)).filter(({ theme }) => theme === 'floating_eye').length, 1);
    assertEquals(mobStates(latestSnapshot(socket)).filter(({ theme }) => theme === 'gas_spore').length, 1);

    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mobs = [...sim.world.query(AI, Position)].map(([id, ai, pos]) => ({ id, ai, pos, home: { ...pos } }));
    assertEquals(mobs.length, 9);
    assertEquals(mobs.filter(({ ai }) => ai.patrolPoints.length > 1).length, 3);
    const assertSpread = () => {
      for (const [index, { ai, pos }] of mobs.entries()) {
        assertEquals(ai.target, null);
        assert(distance(pos, entrance) > 320);
        assert(cave.grid.distanceMove(pos.x, pos.y) >= 20);
        assert(mobs.slice(index + 1).every((other) => distance(pos, other.pos) > 500));
      }
    };
    assertSpread();

    // Patrols have time to turn around repeatedly while the player stays at the entrance.
    const moved = new Set();
    for (let tick = 0; tick < 1200; tick++) {
      room.step();
      for (const { id, ai, pos, home } of mobs) {
        if (ai.patrolPoints.length) {
          assert(distance(pos, home) <= 64);
          if (distance(pos, home) > 32) moved.add(id);
        } else {
          assertEquals(pos, home);
        }
      }
    }
    assertEquals(moved.size, 3);
    assertSpread();

    const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const playerId = sim.getPlayerEntity(peerId);
    const [nearby] = mobs;
    Object.assign(sim.world.get(playerId, Position), nearby.pos);
    room.step();
    assertEquals(nearby.ai.target, playerId);

    sim.world.get(nearby.id, Health).hp = 0;
    for (let tick = 0; tick < 20; tick++) room.step();
    assertEquals([...sim.world.query(AI)].length, 8);

    const eye = mobStates(latestSnapshot(socket)).find(({ theme }) => theme === 'floating_eye');
    const eyeApproach = [[65, 0], [-65, 0], [0, 65], [0, -65]]
      .map(([dx, dy]) => ({ x: eye.x + dx, y: eye.y + dy }))
      .find(({ x, y }) => cave.grid.distanceMove(x, y) >= 14 && sweepMaxFree(cave.grid, eye.x, eye.y, x, y, 5) === 1);
    assert(eyeApproach);
    Object.assign(sim.world.get(playerId, Position), eyeApproach);
    for (let tick = 0; tick < Math.ceil(GAZE_CHARGE_SECONDS / SIM_DT) + 2; tick++) room.step();
    const gazeHit = latestSnapshot(socket);
    const gaze = mobStates(gazeHit).find(({ theme }) => theme === 'floating_eye').gaze;
    const playerRecord = gazeHit.entities.find(({ kind }) => kind === 'player');
    assertEquals(gaze, { target: playerRecord.id, charge: 1 });
    assertEquals(playerRecord.state.conditions.map(({ id }) => id), ['paralyzed']);

    const spore = gazeHit.entities.find(({ state }) => state.theme === 'gas_spore');
    const [sporeId] = [...sim.world.query(Actor)].find(([, actor]) => actor.theme === 'gas_spore');
    applyDamage(sim.world, sporeId, 20, { sourceId: playerId });
    room.step();
    room.step();
    const cloud = latestSnapshot(socket).entities.find(({ state }) => state.auraEmitter?.id === 'spore_cloud');
    assertEquals(cloud?.kind, 'aura_field');
    assertEquals([cloud.state.x, cloud.state.y], [spore.state.x, spore.state.y]);
  } finally {
    room.leave(socket);
  }
});

Deno.test('game room: a ring equips through pickup intent and swapping drops the previous ring', () => {
  const room = new GameRoom(makeRoomState(), {});
  const socket = new FakeSocket();
  room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const entities = latestSnapshot(socket).entities;
    const player = entities.find(({ kind }) => kind === 'player');
    const starter = entities.find(({ state }) => state.slot === 'ring');
    assertEquals(starter.state.rarity, 'epic');
    assertEquals(starter.state.ring.haste, 0.05);
    assertEquals(player.state.ring, null);

    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, {
      input: { seq: 1, pickupX: starter.state.x, pickupY: starter.state.y },
    }));
    room.step();
    room.broadcastSnapshot();
    const equipped = latestSnapshot(socket).entities;
    assertEquals(equipped.find(({ id }) => id === player.id).state.ring, starter.state.ring);
    assert(!equipped.some(({ id }) => id === starter.id));

    const { x, y } = player.state;
    spawnRing(room.ensureSim().world, x, y, { name: 'Test Ring', haste: 0.1 });
    room.step();
    room.broadcastSnapshot();
    assertEquals(latestSnapshot(socket).entities.find(({ id }) => id === player.id).state.ring, starter.state.ring);
    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, { input: { seq: 2, pickupX: x, pickupY: y } }));
    room.step();
    room.broadcastSnapshot();
    const swapped = latestSnapshot(socket).entities;
    assertEquals(swapped.find(({ id }) => id === player.id).state.ring.name, 'Test Ring');
    const dropped = swapped.find(({ kind, state }) => kind === 'item' && state.slot === 'ring');
    assertEquals(dropped.state.ring, starter.state.ring);
    assertEquals(dropped.state.pickupLock.owner, player.id);
  } finally {
    room.leave(socket);
  }
});

function latestSnapshot(socket) {
  const message = [...socket.sent].reverse().find((entry) => entry.type === MESSAGE.SNAPSHOT || entry.type === MESSAGE.WELCOME);
  assert(message?.snapshot);
  return message.snapshot;
}

Deno.test('game room: walking through the campfire applies and replicates timed burning', () => {
  const room = new GameRoom(makeRoomState(), {});
  const socket = new FakeSocket();
  room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const { grid, campfires: [campfire] } = room.ensureCave();
    assert(campfire);
    const field = latestSnapshot(socket).entities.find(({ state }) => state.auraEmitter?.id === 'campfire');
    assert(field);
    assertEquals(field.kind, 'aura_field');
    assertEquals([field.state.x, field.state.y], [campfire.x, campfire.y]);
    assertEquals(field.state.auraEmitter.effects[0].conditionId, 'burning');
    const sim = room.ensureSim();
    const position = sim.world.get(sim.getPlayerEntity(peerId), Position);
    const distance = () => Math.hypot(campfire.x - position.x, campfire.y - position.y);
    const startDistance = distance();
    const moveX = (campfire.x - position.x) / startDistance;
    const moveY = (campfire.y - position.y) / startDistance;
    let seq = 0;
    const move = (x, y) => room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, {
      input: { seq: ++seq, moveX: x, moveY: y },
    }));
    const playerState = () => latestSnapshot(socket).entities.find(({ owner }) => owner === peerId).state;
    room.step();
    room.broadcastSnapshot();
    assertEquals(playerState().conditions, []);
    const initialHp = playerState().hp;

    move(moveX, moveY);
    for (let i = 0; i < 12 && distance() > 8; i++) room.step();
    assert(distance() <= 8);
    move(0, 0);
    for (let i = 0; i < 15; i++) room.step();
    room.broadcastSnapshot();
    assertEquals(playerState().conditions, [{
      id: 'burning', name: 'Burning', glyph: '🔥', visual: 'burning', disposition: 'harmful',
      remaining: 3, duration: 3, stacks: 1,
    }]);
    assert(playerState().hp < initialHp);
    assert(latestSnapshot(socket).events.some(({ type, payload }) =>
      type === 'damage.dealt' && payload.damageType === 'fire' && payload.periodic && payload.amount === 2
    ));

    move(moveX, moveY);
    for (let i = 0; i < 8; i++) room.step();
    move(0, 0);
    room.broadcastSnapshot();
    assert(playerState().conditions[0].remaining < 3);
    const replica = createArenaSimulation({ grid, mode: SIM_MODE.REPLICA });
    replica.applySnapshot(latestSnapshot(socket));
    const replicaConditions = replica.world.get(replica.getPlayerEntity(peerId), Conditions);
    assertEquals(replicaConditions.active[0].id, 'burning');
    assertEquals(replicaConditions.active[0].remaining, playerState().conditions[0].remaining);

    for (let i = 0; i < 61; i++) room.step();
    room.broadcastSnapshot();
    assertEquals(playerState().conditions, []);
    replica.applySnapshot(latestSnapshot(socket));
    assertEquals(replicaConditions.active, []);
  } finally {
    room.leave(socket);
  }
});

Deno.test('game room: a starter Cleave consumes stamina and broadcasts the swing', () => {
  const room = new GameRoom(makeRoomState(), {});
  const socket = new FakeSocket();
  room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const initial = latestSnapshot(socket).entities.find((entity) => entity.kind === 'player').state;
    assertEquals(initial.spells.slice(2), ['cleave', 'rend']);
    assertEquals(initial.stamina, 100);
    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, {
      input: { seq: 1, aimX: 1, fire: true, spellSlot: 2 },
    }));
    room.step();
    room.broadcastSnapshot();
    const snapshot = latestSnapshot(socket);
    const player = snapshot.entities.find((entity) => entity.kind === 'player').state;
    assertEquals(player.stamina, 75);
    assertEquals(player.mana, initial.mana);
    const swing = snapshot.events.find(({ type, payload }) => type === 'spell.cast' && payload.spellId === 'cleave');
    assert(swing);
    assertEquals(swing.payload.meleeArc.hits, []);
    assert(swing.payload.caster.startsWith('player:'));
  } finally {
    room.leave(socket);
  }
});

Deno.test('game room: earned gold follows the account into a fresh run', () => {
  const key = 'player-progress:user-1';
  const saved = new Map([[key, { unlocks: ['example'] }]]);
  const room = new GameRoom(makeRoomState(saved), {});
  const first = new FakeSocket();
  room.accept(first, { userId: 'user-1', displayName: 'First' });
  try {
    const welcome = first.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const { peerId } = welcome;
    assertEquals(welcome.snapshot.entities.find(({ owner }) => owner === peerId).state.gold, 0);
    const sim = room.ensureSim();
    const player = sim.getPlayerEntity(peerId);
    const { x, y } = sim.world.get(player, Position);
    spawnGold(sim.world, x, y, 3);
    room.step();
    assertEquals(saved.get(key), { unlocks: ['example'], gold: 3 });

    sim.world.get(player, Health).hp = 0;
    room.step();
    room.broadcastSnapshot();
    const { state } = latestSnapshot(first).entities.find(({ owner }) => owner === peerId);
    assertEquals(state.hp, 0);
    assertEquals(state.gold, 3);
  } finally {
    room.leave(first);
  }

  const nextRoom = new GameRoom(makeRoomState(saved), {});
  const returning = new FakeSocket();
  const otherAccount = new FakeSocket();
  try {
    nextRoom.accept(returning, { userId: 'user-1', displayName: 'Renamed' });
    const restored = returning.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const player = restored.snapshot.entities.find(({ owner }) => owner === restored.peerId).state;
    assertEquals(player.gold, 3);
    assertEquals(player.hp, player.maxHp);
    nextRoom.accept(otherAccount, { userId: 'user-2', displayName: 'Renamed' });
    const other = otherAccount.sent.find(({ type }) => type === MESSAGE.WELCOME);
    assertEquals(other.snapshot.entities.find(({ owner }) => owner === other.peerId).state.gold, 0);
  } finally {
    nextRoom.leave(returning);
    nextRoom.leave(otherAccount);
  }
});
