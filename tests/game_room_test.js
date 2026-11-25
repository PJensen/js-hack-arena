import { assert, assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { timingSafeEqual } from 'node:crypto';
import { AI, Actor, Conditions, Health, Position, Projectile, Spellbook } from '../public/src/rules/components/index.js';
import { MINING_SECONDS } from '../public/src/rules/components/Mining.js';
import { SIM_DT, SIM_MODE } from '../public/src/rules/sim/arenaSim.js';
import { createArenaDungeonSimulation } from '../public/src/rules/sim/arenaDungeon.js';
import { GAZE_CHARGE_SECONDS } from '../public/src/rules/components/AI.js';
import { getMiningMaterial } from '../public/src/rules/data/miningMaterials.js';
import { generateArenaCave } from '../public/src/rules/geometry/caveGen.js';
import { canMineOre } from '../public/src/rules/geometry/oreSites.js';
import { sweepMaxFree } from '../public/src/rules/geometry/sweep.js';
import { applyDamage } from '../public/src/rules/effects.js';
import { spawnGold, spawnRing } from '../public/src/rules/spawner.js';
import { MESSAGE, decodeMessage, encodeMessage, makeRoomSeed } from '../public/src/shared/net/protocol.js';
import { createRoomHandoff, verifyRoomHandoff } from '../worker/auth.js';
import { GameRoom } from '../worker/index.js';

async function verifyTestHandoff(handoff, roomId, env) {
  // Workers extends Web Crypto with timingSafeEqual. Deno exposes it via node:crypto.
  if (crypto.subtle.timingSafeEqual) return verifyRoomHandoff(handoff, roomId, env);
  crypto.subtle.timingSafeEqual = timingSafeEqual;
  try {
    return await verifyRoomHandoff(handoff, roomId, env);
  } finally {
    delete crypto.subtle.timingSafeEqual;
  }
}

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
  assertEquals(secondView.entities.filter(({ kind, state }) => kind === 'item' && state.ring).length, 0);

  room.leave(first);
  room.leave(second);
});

Deno.test('game room: /say reaches distant peers and uses the signed character name', async () => {
  const env = { ARENA_SESSION_SECRET: 'test-room-handoff-secret' };
  const room = new GameRoom(makeRoomState(), env);
  const otherRoom = new GameRoom({ ...makeRoomState(), id: { toString: () => 'other-room' } }, {});
  const speaker = new FakeSocket();
  const listener = new FakeSocket();
  const outsider = new FakeSocket();
  const account = { sub: 'user-1', name: 'Account Holder' };
  const handoff = await createRoomHandoff(account, room.roomId, '  First  ', env);
  const identity = await verifyTestHandoff(handoff, room.roomId, env);
  const defaultHandoff = await createRoomHandoff(account, room.roomId, null, env);
  assertEquals(await verifyTestHandoff(defaultHandoff, room.roomId, env), {
    userId: 'user-1', displayName: 'Adventurer',
  });
  room.accept(speaker, identity);
  room.accept(listener, { userId: 'user-2', displayName: 'Second' });
  otherRoom.accept(outsider, { userId: 'user-3', displayName: 'Outsider' });
  try {
    const { peerId, peers, snapshot } = speaker.sent.find(({ type }) => type === MESSAGE.WELCOME);
    assertEquals(peers.find(({ id }) => id === peerId).name, 'First');
    assertEquals(snapshot.entities.find(({ owner }) => owner === peerId).state.name, 'First');
    const listenerPeer = listener.sent.find(({ type }) => type === MESSAGE.WELCOME).peerId;
    const sim = room.ensureSim();
    const distant = sim.world.get(sim.getPlayerEntity(listenerPeer), Position);
    distant.x += 5000;
    const say = (socket, payload) => room.handleMessage(socket, encodeMessage(MESSAGE.SAY, payload));
    const messages = (socket) => socket.sent.filter(({ type }) => type === MESSAGE.SAY)
      .map(({ peerId, name, text }) => ({ peerId, name, text }));
    const rejectionCount = (socket) => socket.sent.filter(({ type }) => type === MESSAGE.SAY_ERROR).length;

    say(speaker, { text: 42 });
    say(speaker, { text: ' '.repeat(200) + 'hello' });
    say(speaker, { text: '  hello\n <b> ', peerId: 'fake', name: 'Fake' });
    const delivered = [{ peerId, name: 'First', text: 'hello <b>' }];
    assertEquals(messages(speaker), delivered);
    assertEquals(messages(listener), delivered);
    assertEquals(messages(outsider), []);
    assertEquals(rejectionCount(speaker), 2);
    assertEquals(rejectionCount(listener), 0);

    say(speaker, { text: 'too soon' });
    assertEquals(rejectionCount(speaker), 3);
    assertEquals(messages(listener), delivered);
    say(listener, { text: 'heard you' });
    assertEquals(messages(speaker).at(-1), { peerId: listenerPeer, name: 'Second', text: 'heard you' });
  } finally {
    room.leave(speaker);
    room.leave(listener);
    otherRoom.leave(outsider);
  }
});

Deno.test('game room: opening chat interrupts an in-progress cast before release', () => {
  const room = new GameRoom(makeRoomState(), {});
  const socket = new FakeSocket();
  room.accept(socket, { userId: 'caster', displayName: 'Caster' });
  try {
    const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const sim = room.ensureSim();
    const book = sim.world.get(sim.getPlayerEntity(peerId), Spellbook);
    const input = (frame) => room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, { input: frame }));
    input({ seq: 1, aimX: 1, fire: true });
    for (let i = 0; i < 4; i++) room.step();
    assertEquals(book.castPhase, 'charging');
    input({ seq: 2, cancelCast: true });
    room.step();
    assertEquals(book.castPhase, 'idle');
    assertEquals([...sim.world.query(Projectile)].length, 0);

    input({ seq: 3, aimX: 1, fire: true });
    room.step();
    input({ seq: 4 });
    room.step();
    assertEquals([...sim.world.query(Projectile)].length, 1);
  } finally {
    room.leave(socket);
  }
});

Deno.test('game room: initial dungeon setup matches offline play and dead-end chests open once', () => {
  const room = new GameRoom(makeRoomState(), {});
  const first = new FakeSocket();
  const second = new FakeSocket();
  room.accept(first, { userId: 'user-1', displayName: 'First' });
  try {
    const cave = generateArenaCave(room.seed);
    const offline = createArenaDungeonSimulation({ seed: room.seed, cave });
    offline.addPlayer('offline', 0, null, 'First');
    const dungeonEntities = ({ entities }) => entities.filter(({ kind }) => kind !== 'player');
    const roomSnapshot = latestSnapshot(first);
    assertEquals(dungeonEntities(roomSnapshot), dungeonEntities(offline.captureSnapshot()));
    const roomPlayer = roomSnapshot.entities.find(({ kind }) => kind === 'player');
    assertEquals(roomPlayer?.state, offline.getPlayerSnapshot('offline').state);

    const chests = (snapshot) => snapshot.entities.filter(({ state }) => state.effect === 'epic_chest');
    const initial = chests(roomSnapshot);
    assertEquals(initial.length, 1);

    const sim = room.ensureSim();
    const { peerId } = first.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const position = sim.world.get(sim.getPlayerEntity(peerId), Position);
    const [{ id, state: { x, y } }] = initial;
    Object.assign(position, { x, y });
    room.step();
    room.step();
    const snapshot = sim.captureSnapshot();
    assertEquals(chests(snapshot), initial.filter((chest) => chest.id !== id));
    assertEquals(snapshot.events.filter(({ type }) => type === 'chest.opened').length, 1);
    assert(snapshot.entities.some(({ kind, state }) => kind === 'item' && state.tossHeight > 0));

    room.accept(second, { userId: 'user-2', displayName: 'Second' });
    assertEquals(chests(latestSnapshot(second)), chests(snapshot));
  } finally {
    room.leave(first);
    room.leave(second);
  }
});

Deno.test('game room: Mimics use both encounter site types and share a dungeon cap', () => {
  // mimic-50 rolls a leaf Mimic and would also roll a regular Mimic without the cap.
  for (const [roomId, leaf] of [['mimic-50', true], ['lobby', false]]) {
    const room = new GameRoom(makeRoomState(), {});
    room.seed = makeRoomSeed(roomId);
    const socket = new FakeSocket();
    room.accept(socket, { userId: 'user-1', displayName: 'First' });
    try {
      const cave = room.ensureCave();
      const mimics = (snapshot) => snapshot.entities.filter(({ state }) => state.theme === 'mimic');
      const initial = latestSnapshot(socket);
      const records = mimics(initial);
      assertEquals(records.length, 1);
      const [{ id, kind, state }] = records;
      assertEquals(kind, 'mob');
      assertEquals(state.mimicClosed, true);
      const sites = leaf ? cave.chestSites : cave.encounterSites;
      assert(sites.some(({ x, y }) => x === state.x && y === state.y));
      assertEquals(initial.entities.filter(({ state }) => state.effect === 'epic_chest').length, leaf ? 0 : 1);

      const sim = room.ensureSim();
      const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
      Object.assign(sim.world.get(sim.getPlayerEntity(peerId), Position), { x: state.x, y: state.y });
      room.step();
      const revealed = mimics(sim.captureSnapshot());
      assertEquals(revealed.length, 1);
      assertEquals(revealed[0].id, id);
      assert(!revealed[0].state.mimicClosed);
      assert(revealed[0].state.mimicWindup > 0);
    } finally {
      room.leave(socket);
    }
  }
});

Deno.test('game room: encounters stay spread out while some mobs patrol', () => {
  const room = new GameRoom(makeRoomState(), {});
  const socket = new FakeSocket();
  room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const cave = room.ensureCave();
    const [entrance] = cave.spawns;
    const sim = room.ensureSim();
    const mobStates = (snapshot) => snapshot.entities.filter(({ kind }) => kind === 'mob').map(({ state }) => state);
    const initialMobs = mobStates(latestSnapshot(socket));
    assertEquals(initialMobs.filter(({ theme }) => theme === 'floating_eye').length, 1);
    assertEquals(initialMobs.filter(({ theme }) => theme === 'gas_spore').length, 1);
    assertEquals(initialMobs.filter(({ theme }) => theme === 'bat').length, 3);
    assertEquals(initialMobs.filter(({ theme }) => theme === 'flaming_bat').length, 1);

    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mobs = [...sim.world.query(AI, Position, Actor)].map(([id, ai, pos, actor]) => ({ id, ai, pos, home: { ...pos }, theme: actor.theme }));
    assertEquals(mobs.length, 11);
    assertEquals(mobs.filter(({ ai }) => ai.patrolPoints.length > 1).length, 3);
    const bats = mobs.filter(({ theme }) => theme === 'bat');
    for (const [index, bat] of bats.entries()) {
      assert(bats.slice(index + 1).every((other) => distance(bat.home, other.home) >= 24 && distance(bat.home, other.home) <= 64));
    }
    const assertSpread = () => {
      for (const [index, { ai, pos, theme }] of mobs.entries()) {
        assertEquals(ai.target, null);
        assert(distance(pos, entrance) > 320);
        assert(cave.grid.distanceMove(pos.x, pos.y) >= 20);
        assert(mobs.slice(index + 1).every((other) =>
          theme === 'bat' && other.theme === 'bat' ? distance(pos, other.pos) <= 96 : distance(pos, other.pos) > 500
        ));
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
    assertEquals([...sim.world.query(AI)].length, 10);

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

    const [flamingBat] = [...sim.world.query(Actor)].find(([, actor]) => actor.theme === 'flaming_bat');
    applyDamage(sim.world, flamingBat, 40, { sourceId: playerId });
    room.step();
    room.step();
    const fireSnapshot = latestSnapshot(socket);
    assertEquals(fireSnapshot.entities.some(({ state }) => state.theme === 'flaming_bat'), false);
    assertEquals(fireSnapshot.entities.filter(({ state }) => state.auraEmitter?.id === 'bat_flame_puff').length, 1);
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
    assertEquals(player.state.ring, null);
    const { x, y } = player.state;
    spawnRing(room.ensureSim().world, x, y);
    room.broadcastSnapshot();
    const ring = latestSnapshot(socket).entities.find(({ kind, state }) => kind === 'item' && state.ring);
    assertEquals(ring.state.rarity, 'epic');
    assertEquals(ring.state.ring.haste, 0.05);

    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, {
      input: { seq: 1, pickupX: x, pickupY: y },
    }));
    room.step();
    room.broadcastSnapshot();
    const equipped = latestSnapshot(socket).entities;
    assertEquals(equipped.find(({ id }) => id === player.id).state.ring, ring.state.ring);
    assert(!equipped.some(({ id }) => id === ring.id));

    spawnRing(room.ensureSim().world, x, y, { name: 'Test Ring', haste: 0.1 });
    room.step();
    room.broadcastSnapshot();
    assertEquals(latestSnapshot(socket).entities.find(({ id }) => id === player.id).state.ring, ring.state.ring);
    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, { input: { seq: 2, pickupX: x, pickupY: y } }));
    room.step();
    room.broadcastSnapshot();
    const swapped = latestSnapshot(socket).entities;
    assertEquals(swapped.find(({ id }) => id === player.id).state.ring.name, 'Test Ring');
    const dropped = swapped.find(({ kind, state }) => kind === 'item' && state.slot === 'ring');
    assertEquals(dropped.state.ring, ring.state.ring);
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

Deno.test('game room: a mining command drops ore and a gem and late joins see the spent vein', () => {
  const room = new GameRoom(makeRoomState(), {});
  room.seed = 42;
  const miner = new FakeSocket();
  const late = new FakeSocket();
  room.accept(miner, { userId: 'miner', displayName: 'Miner' });
  try {
    const sim = room.ensureSim();
    const site = sim.getMineableOre()[0];
    assertEquals(site.id, 0);
    const mine = (seq) => room.handleMessage(miner, encodeMessage(MESSAGE.INPUT, {
      input: { seq, pickupX: site.x, pickupY: site.y, mine: true },
    }));
    const { peerId } = miner.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const pos = sim.world.get(sim.getPlayerEntity(peerId), Position);
    const grid = room.ensureCave().grid;
    const stand = [36, 24].map((distance) => ({
      x: site.x - distance * site.normalX, y: site.y - distance * site.normalY,
    })).find((point) => grid.distanceMove(point.x, point.y) >= 20 && canMineOre(grid, point, site));
    assert(stand);

    mine(1);
    room.step();
    assert(sim.getMineableOre().some(({ id }) => id === site.id));
    Object.assign(pos, stand);
    mine(2);
    room.step();
    room.broadcastSnapshot();
    const active = latestSnapshot(miner);
    assertEquals(active.entities.find((entity) => entity.kind === 'player').state.mining,
      { siteId: site.id, remaining: MINING_SECONDS });
    assert(active.oreAvailable.includes(site.id));
    assert(!active.entities.some(({ state }) => getMiningMaterial(state.effect)));

    for (let i = 1; i < MINING_SECONDS / SIM_DT; i++) room.step();
    assert(sim.getMineableOre().some(({ id }) => id === site.id));
    room.step();

    room.accept(late, { userId: 'late', displayName: 'Late' });
    const joined = latestSnapshot(late);
    const drops = joined.entities.filter(({ state }) => getMiningMaterial(state.effect));
    assertEquals(drops.filter(({ state }) => state.effect === 'copper_ore').length, 3);
    assertEquals(drops.filter(({ state }) => getMiningMaterial(state.effect).shape === 'gem').length, 1);
    assert(drops.every(({ state }) => state.tossHeight === 0));
    assert(!joined.oreAvailable.includes(site.id));
  } finally {
    room.leave(miner);
    room.leave(late);
  }
});

Deno.test('game room: walking through the campfire applies and replicates timed burning', () => {
  const room = new GameRoom(makeRoomState(), {});
  const socket = new FakeSocket();
  room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const { campfires: [campfire] } = room.ensureCave();
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
    const cave = generateArenaCave(room.seed);
    const replica = createArenaDungeonSimulation({ seed: room.seed, cave, mode: SIM_MODE.REPLICA });
    assertEquals(replica.world.alive.size, 0);
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
    for (let i = 0; i < 18; i++) room.step();
    room.broadcastSnapshot();
    const held = latestSnapshot(socket);
    const charging = held.entities.find((entity) => entity.kind === 'player').state;
    assertEquals(charging.castPhase, 'charging');
    assertEquals(charging.stamina, 100);
    assertEquals(held.events.filter(({ type }) => type === 'spell.cast'), []);
    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, { input: { seq: 2, fire: false } }));
    room.step();
    room.broadcastSnapshot();
    const snapshot = latestSnapshot(socket);
    const player = snapshot.entities.find((entity) => entity.kind === 'player').state;
    assertEquals(player.stamina, 75);
    assertEquals(player.mana, initial.mana);
    const swing = snapshot.events.find(({ type, payload }) => type === 'spell.cast' && payload.spellId === 'cleave');
    assert(swing);
    assertEquals(swing.payload.charge, 1);
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
